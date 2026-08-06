'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, X as XIcon, RotateCcw, ChevronDown, ChevronLeft, ChevronRight, Plus, Video, Pencil, ExternalLink, Trash2, Calendar, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { TrackerGroup, TrackerStudent, TrackerLesson, TrackerAttendance, AttendanceStatus, CourseId, LessonKind } from '@/lib/types';
import { COURSES } from '@/lib/diplomas';
import { createClass, transferClassTeacher } from '@/app/admin/actions';
import { computeModuleLesson, formatModuleLesson, totalLessonsFor } from '@/lib/lessonNumbering';
import { MAX_CONTACTS, asContactList, cleanContactList, toEditableList } from '@/lib/contactList';

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

// Plafon de bun-simt pentru campurile istorice suprascrise manual (steluțe/prezențe/absențe) -
// previne o valoare aberanta introdusa din greseala (ex. o cifra in plus la tastare), fara sa
// limiteze vreun caz real de utilizare. Acelasi ordin de marime ca milestone-ul validat
// server-side in /api/diploma-milestone-alerts.
const MAX_HISTORICAL_COUNT = 100_000;

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

// MAX_CONTACTS, asContactList, cleanContactList, toEditableList sunt importate din
// @/lib/contactList (partajate cu rutele API care retrimit notificari).

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

/** Scroll-ul mouse-ului peste un input focusat schimba valoarea nativ in Chrome/Firefox -
 * un profesor care doar deruleaza pagina peste un camp numeric ii poate modifica accidental
 * valoarea fara sa observe. Blur la wheel dezactiveaza asta, fara sa afecteze tastatura sau
 * sagetile din interiorul input-ului (spin buttons). */
function blurOnWheel(e: React.WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
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

// Zile ramase din cele 7 permise de la absenta (absence_date, format YYYY-MM-DD) pana la
// recuperare - folosit pentru badge-ul "⏳ Mai sunt N zile" din cardul de recuperare. Comparam
// la nivel de zi calendaristica (nu ore), ca sa nu scada un zi doar din cauza orei curente.
function makeupDaysRemaining(absenceDate: string | null): number | null {
  if (!absenceDate) return null;
  const start = new Date(`${absenceDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysElapsed = Math.round((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return 7 - daysElapsed;
}

// Ora curenta STRICT in fusul Europe/Bucharest (0-23), indiferent de fusul orar local al
// dispozitivului profesorului - folosita pentru "ore de liniste" (nu trimitem notificari catre
// parinti intre 20:00 si 8:00). hourCycle: 'h23' evita un bug cunoscut Intl unde miezul noptii
// poate iesi ca "24" in loc de "0" cu hour12: false.
function getBucharestHour(): number {
  return parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: 'numeric', hourCycle: 'h23' }).format(new Date()),
    10
  );
}

const DAY_TO_JS_INDEX: Record<string, number> = { duminica: 0, luni: 1, marti: 2, miercuri: 3, joi: 4, vineri: 5, sambata: 6 };

// Baza numelui clasei se genereaza automat din Modul + Ziua + Ora, de fiecare data cand
// oricare dintre cele trei se schimba (vezi useEffect-urile de langa createName/editClassName
// mai jos) - campul ramane totusi editabil, ca adminul sa poata adauga ceva manual la final.
function buildAutoClassName(moduleNum: number, dayId: string | null, time: string) {
  const parts = [`M${moduleNum}`];
  const dayLabel = DAYS.find((d) => d.id === dayId)?.label;
  if (dayLabel) parts.push(time ? `${dayLabel} la ${time}` : dayLabel);
  else if (time) parts.push(`la ${time}`);
  return parts.join(' ');
}

// Normalizeaza ce tasteaza utilizatorul intr-un input de ora spre formatul strict HH:mm
// (24h, fara AM/PM) - pastreaza doar cifre, insereaza automat ":" dupa a doua cifra (DOAR
// cand utilizatorul scrie inainte, nu si la stergere - altfel backspace ar ramane blocat
// mereu inapoi la ":" reinserat) si taie la 5 caractere.
function normalizeTimeTyping(next: string, previous: string): string {
  let v = next.replace(/[^\d:]/g, '').slice(0, 5);
  const isDeleting = next.length < previous.length;
  if (!isDeleting && v.length === 2 && !v.includes(':')) v += ':';
  return v;
}
const TIME_PATTERN = '^([01]\\d|2[0-3]):[0-5]\\d$';

/** Input de ora in format STRICT 24h - text simplu cu masca, nu <input type="time"> nativ,
 * ca sa nu depinda de locale-ul browserului (unele afiseaza AM/PM). Optional (poate fi gol). */
function TimeInput({
  value, onChange, className, placeholder = 'HH:MM',
}: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string }) {
  return (
    <input
      type="text" inputMode="numeric" placeholder={placeholder} maxLength={5}
      pattern={TIME_PATTERN} title="Ora in format 24h, ex: 09:00 sau 18:30"
      value={value} onChange={(e) => onChange(normalizeTimeTyping(e.target.value, value))}
      className={className}
    />
  );
}

/** true = id-ul e un curs "cunoscut" (din COURSES) sau lipseste - false = e un curs custom
 * (text liber introdus din "+ Alt curs..."). Folosit ca sa stim in ce mod sa pornim
 * selectorul (grid de butoane vs. input text) cand deschidem modalul de editare. */
function isKnownCourseId(id: CourseId | null): boolean {
  return id === null || COURSES.some((c) => c.id === id);
}

/**
 * Selector de curs: grid de butoane pentru cursurile cunoscute (cu sablon de diploma) +
 * "Nespecificat" + "+ Alt curs..." - ultimul comuta pe un input de text liber, pentru orice
 * curs nou care inca nu are sablon de diploma configurat. Reutilizat identic la Creare si
 * Editare Clasa, ca cele doua formulare sa nu diveraga in timp.
 */
function CourseGrid({
  value, custom, onSelect, onEnterCustom, onExitCustom,
}: {
  value: CourseId | null; custom: boolean;
  onSelect: (id: CourseId | null) => void; onEnterCustom: () => void; onExitCustom: () => void;
}) {
  if (custom) {
    return (
      <div className="flex gap-2">
        <input
          type="text" value={value ?? ''} onChange={(e) => onSelect(e.target.value)}
          placeholder="Numele cursului nou" autoFocus
          className="flex-1 bg-gray-800 border border-gray-700 rounded-2xl px-4 py-2.5 text-sm text-white"
        />
        <button
          type="button" onClick={onExitCustom} title="Renunta la cursul custom, alege din lista"
          className="bg-gray-700 hover:bg-gray-600 px-3 rounded-2xl text-xs font-semibold transition-colors"
        >
          ✕
        </button>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-2">
      <button
        type="button" onClick={() => onSelect(null)}
        className={`py-2 rounded-2xl font-semibold text-xs transition-colors ${value === null ? 'bg-[#C8F023] text-black' : 'bg-gray-700 text-white'}`}
      >
        Nespecificat
      </button>
      {COURSES.map((c) => (
        <button
          key={c.id} type="button" onClick={() => onSelect(c.id)}
          className={`py-2 rounded-2xl font-semibold text-xs transition-colors ${value === c.id ? 'bg-[#C8F023] text-black' : 'bg-gray-700 text-white'}`}
        >
          {c.label}
        </button>
      ))}
      <button
        type="button" onClick={onEnterCustom}
        className="py-2 rounded-2xl font-semibold text-xs transition-colors bg-gray-700 text-white border border-dashed border-gray-500 hover:border-gray-300"
      >
        + Alt curs...
      </button>
    </div>
  );
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
  // Prima intrebare la apasarea "Recuperat": profesorul alege explicit daca a fost o
  // sesiune 1-la-1 sau una de grup, INAINTE de a completa data/ora recuperarii.
  | { type: 'recoveryTypeChoice'; studentId: string; lessonId: string }
  | { type: 'recordRecovery'; studentId: string; lessonId: string }
  // Data/ora recuperarii + chenarul cu ceilalti colegi din grupa, pentru bifat cine a
  // participat efectiv (vezi GroupRecoveryFormModal si handleSubmitGroupRecovery).
  | { type: 'recordGroupRecovery'; studentId: string; lessonId: string }
  | { type: 'studentHistory'; studentId: string }
  | { type: 'editMakeupLink' };

export default function ProgressTracker({
  teacherId, teacherName, teacherPhone, makeupCalendarLink: initialMakeupCalendarLink, isAdmin, teacherOptions,
  initialGroups, initialStudents, initialLessons, initialAttendance,
}: {
  teacherId: string; teacherName: string; teacherPhone: string | null; makeupCalendarLink: string | null;
  isAdmin: boolean; teacherOptions: { id: string; label: string }[];
  initialGroups: TrackerGroup[]; initialStudents: TrackerStudent[];
  initialLessons: TrackerLesson[]; initialAttendance: TrackerAttendance[];
}) {
  const supabase = useMemo(() => createClient(), []);
  // Folosit DOAR ca semnal de invalidare a Router Cache-ului Next.js dupa o mutatie de
  // clasa (creare/editare/transfer/stergere) - vezi comentariul de langa fiecare apel.
  // NU reincarca aceasta pagina si nu atinge state-ul local optimist (deja corect).
  const router = useRouter();

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
  // Popup automat "Task Urgent" de diploma - la fiecare 16 prezente (istoric + curent) ale
  // unui elev, independent de modalul de editare (acelasi tipar ca magicPopup de mai sus).
  const [diplomaMilestonePopup, setDiplomaMilestonePopup] = useState<{ studentId: string; milestone: number } | null>(null);
  // Popup de confirmare dupa "✅ Recuperare efectuata" pe cardul de recuperare din Task-uri Urgente.
  const [makeupDoneNotice, setMakeupDoneNotice] = useState(false);
  // Popup afisat cand butonul "+" (lectie noua) e blocat pentru ca ultima lectie a clasei mai
  // are elevi nemarcati (vezi openNewLessonModal). O lectie 100% absenta NU mai blocheaza nimic
  // - se salveaza normal, iar indexul de materie ramane inghetat automat (vezi computeModuleLesson
  // - se bazeaza pe nr. de prezente/recuperari, nu pe session_number, deci un elev absent nu
  // avanseaza niciodata in materie). null = niciun blocaj activ.
  const [newLessonBlockNotice, setNewLessonBlockNotice] = useState<'unmarked' | null>(null);
  // Elevul pentru care s-a apasat "Trimite Notificare" si asteapta confirmarea "Ai sloturi
  // disponibile in calendar?" (Da/Nu) inainte de trimiterea efectiva catre Pabbly.
  const [makeupNotifyConfirm, setMakeupNotifyConfirm] = useState<TrackerStudent | null>(null);
  // Link catre calendarul propriu de recuperari (buton "📅 Link Recuperari" de langa "+ Adauga
  // Clasa") - apartine contului autentificat (teacherId), nu profesorului vizualizat de admin
  // (acelasi tipar ca teacherPhone mai jos). draft/saving alimenteaza modalul de editare.
  const [makeupCalendarLink, setMakeupCalendarLink] = useState(initialMakeupCalendarLink);
  const [makeupLinkDraft, setMakeupLinkDraft] = useState('');
  const [savingMakeupLink, setSavingMakeupLink] = useState(false);
  // Previn dubla trimitere (dublu-click accidental) pe "Am inteles" si pe "Am trimis diploma" -
  // butonul se dezactiveaza cat timp request-ul e in desfasurare.
  const [acknowledgingMilestone, setAcknowledgingMilestone] = useState(false);
  const [markingDiplomaSentIds, setMarkingDiplomaSentIds] = useState<Set<string>>(new Set());
  // Acelasi rol ca markingDiplomaSentIds, dar pentru cardul de recuperare (pending_makeups)
  // din Task-uri Urgente - previne dublu-click pe "Recuperare efectuata" / "Nu mai e nevoie".
  const [markingMakeupIds, setMarkingMakeupIds] = useState<Set<string>>(new Set());
  // Evita redeschiderea popup-ului pentru acelasi elev+prag in aceeasi sesiune daca profesorul
  // l-a inchis fara sa apese "Am inteles" (starea din DB - pending_diploma_milestone - ramane
  // sursa de adevar pe termen lung, la urmatorul reload).
  const shownMilestonesRef = useRef<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const [createForm, setCreateForm] = useState<{ module: number; count: number; reward: string; names: string[]; day: string | null; time: string; course: CourseId | null }>(
    { module: 1, count: 1, reward: 'stars', names: [''], day: 'luni', time: '', course: null }
  );
  // Numele clasei la creare - pornit din baza auto-generata (Modul + Ziua + Ora), dar ramas
  // editabil manual; useEffect-ul de mai jos il regenereaza de fiecare data cand oricare din
  // cele 3 componente se schimba (vezi buildAutoClassName).
  const [createName, setCreateName] = useState(() => buildAutoClassName(1, 'luni', ''));
  const [createCourseCustom, setCreateCourseCustom] = useState(false);
  useEffect(() => {
    setCreateName(buildAutoClassName(createForm.module, createForm.day, createForm.time));
  }, [createForm.module, createForm.day, createForm.time]);

  const [editClassName, setEditClassName] = useState('');
  const [editClassDay, setEditClassDay] = useState<string | null>(null);
  const [editClassTime, setEditClassTime] = useState('');
  const [editClassCourse, setEditClassCourse] = useState<CourseId | null>(null);
  const [editClassCourseCustom, setEditClassCourseCustom] = useState(false);
  // Cheia modalului de editare curent deschis (groupId), sau null daca e inchis - folosita
  // de useEffect-ul de mai jos ca sa deosebeasca "tocmai s-a deschis modalul" (nu regeneram
  // numele, ca sa nu suprascriem un nume custom existent) de "ziua/ora chiar s-au schimbat
  // cat timp modalul era deja deschis" (abia atunci regeneram).
  const lastEditModalKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = modal.type === 'editClass' ? modal.groupId : null;
    if (key !== lastEditModalKeyRef.current) {
      lastEditModalKeyRef.current = key;
      return;
    }
    if (key === null) return;
    const group = getGroupById(key);
    if (!group) return;
    setEditClassName(buildAutoClassName(group.module_count || 1, editClassDay, editClassTime));
    // getGroupById citeste `groups` curent la fiecare apel - nu trebuie in deps (ar re-declansa
    // efectul la orice alta schimbare de stare din grupe, nu doar la zi/ora).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, editClassDay, editClassTime]);
  // Doar admin: profesorul ales in dropdown-ul "Transfera clasa la alt profesor" din modalul
  // de editare - initializat mereu cu proprietarul curent al clasei, ca sa nu declansam un
  // transfer accidental daca adminul doar schimba numele/ziua/ora si salveaza.
  const [editClassTransferTeacherId, setEditClassTransferTeacherId] = useState('');
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
      // Link-ul de recuperari e per-profesor (coloana makeup_calendar_link din profiles) -
      // la revenirea pe propriul cont, redevine cel din props (incarcat initial de page.tsx
      // pentru profile.id-ul autentificat), nu cel al profesorului vizualizat anterior.
      setMakeupCalendarLink(initialMakeupCalendarLink);
      setView('home'); setCurrentGroupId(null); setModal({ type: null });
      return;
    }
    let cancelled = false;
    setTeacherSwitchLoading(true);
    (async () => {
      const [{ data: g }, { data: s }, { data: l }, { data: a }, { data: p }] = await Promise.all([
        supabase.from('tracker_groups').select('*').eq('teacher_id', viewedTeacherId).order('created_at'),
        supabase.from('tracker_students').select('*').eq('teacher_id', viewedTeacherId).order('created_at'),
        supabase.from('tracker_lessons').select('*').eq('teacher_id', viewedTeacherId).order('session_number'),
        supabase.from('tracker_attendance').select('*').eq('teacher_id', viewedTeacherId),
        // RLS pe profiles ("profil propriu sau admin") permite acest select DOAR pentru ca
        // cel ce vizualizeaza e admin (un profesor obisnuit nu poate ajunge in aceasta ramura,
        // viewedTeacherId al lui fiind mereu egal cu teacherId al lui).
        supabase.from('profiles').select('makeup_calendar_link').eq('id', viewedTeacherId).single(),
      ]);
      if (cancelled) return;
      setGroups((g ?? []) as TrackerGroup[]);
      setStudents((s ?? []) as TrackerStudent[]);
      setLessons((l ?? []) as TrackerLesson[]);
      setAttendance((a ?? []) as TrackerAttendance[]);
      setMakeupCalendarLink(p?.makeup_calendar_link ?? null);
      setView('home'); setCurrentGroupId(null); setModal({ type: null });
      setTeacherSwitchLoading(false);
    })();
    return () => { cancelled = true; };
  }, [viewedTeacherId, teacherId, initialGroups, initialStudents, initialLessons, initialAttendance, initialMakeupCalendarLink, supabase]);

  // Reincarca manual datele profesorului vizualizat curent - acelasi fetch ca in efectul de
  // schimbare a profesorului de mai sus, dar apelabil oricand (ex. dupa un transfer de clasa
  // la alt profesor, cand grupa transferata trebuie sa dispara instant din vederea curenta).
  async function reloadViewedTeacherData() {
    if (viewedTeacherId === teacherId) {
      setGroups(initialGroups); setStudents(initialStudents);
      setLessons(initialLessons); setAttendance(initialAttendance);
      setMakeupCalendarLink(initialMakeupCalendarLink);
      return;
    }
    const [{ data: g }, { data: s }, { data: l }, { data: a }, { data: p }] = await Promise.all([
      supabase.from('tracker_groups').select('*').eq('teacher_id', viewedTeacherId).order('created_at'),
      supabase.from('tracker_students').select('*').eq('teacher_id', viewedTeacherId).order('created_at'),
      supabase.from('tracker_lessons').select('*').eq('teacher_id', viewedTeacherId).order('session_number'),
      supabase.from('tracker_attendance').select('*').eq('teacher_id', viewedTeacherId),
      supabase.from('profiles').select('makeup_calendar_link').eq('id', viewedTeacherId).single(),
    ]);
    setGroups((g ?? []) as TrackerGroup[]);
    setStudents((s ?? []) as TrackerStudent[]);
    setLessons((l ?? []) as TrackerLesson[]);
    setAttendance((a ?? []) as TrackerAttendance[]);
    setMakeupCalendarLink(p?.makeup_calendar_link ?? null);
  }

  // ---- selectori ----
  // Recalculate doar cand `groups`/`students` chiar se schimba, nu la fiecare re-render al
  // componentei (toast-uri, animatii de celebrare, deschidere/inchidere meniu etc. re-randeaza
  // ProgressTracker foarte des, iar aceste liste ar fi refiltrate/resortate degeaba de fiecare
  // data - vezi audit-ul de performanta, "Progress Tracker").
  const activeGroups = useMemo(() => groups.filter((g) => !g.deleted_at), [groups]);
  const deletedGroups = useMemo(() => groups.filter((g) => g.deleted_at), [groups]);
  const getStudentsForGroup = (groupId: string) => students.filter((s) => s.group_id === groupId && !s.deleted_at);
  const getDeletedStudentsForGroup = (groupId: string) => students.filter((s) => s.group_id === groupId && s.deleted_at);
  const getGroupById = (groupId: string | null) => activeGroups.find((g) => g.id === groupId) ?? null;
  const calcAvgProgress = (groupId: string) => {
    const list = getStudentsForGroup(groupId);
    if (list.length === 0) return 0;
    return Math.round(list.reduce((sum, s) => sum + s.progress, 0) / list.length);
  };
  // "🚨 Task-uri Urgente" - elevii cu un task de diploma deschis (pending_diploma_milestone),
  // pentru profesorul curent afisat (viewedTeacherId).
  const pendingDiplomaStudents = useMemo(
    () => students.filter((s) => !s.deleted_at && s.pending_diploma_milestone),
    [students]
  );
  // "🚨 Task-uri Urgente" - elevii cu recuperari neefectuate (pending_makeups), crescute cand
  // profesorul marcheaza un elev "Absent" la o lectie (vezi setAttendanceStatus).
  const pendingMakeupStudents = useMemo(
    () => students.filter((s) => !s.deleted_at && s.pending_makeups > 0),
    [students]
  );
  const hasUrgentTasks = pendingDiplomaStudents.length > 0 || pendingMakeupStudents.length > 0;

  const currentGroup = getGroupById(currentGroupId);
  const totalDataCount = groups.length + students.length;

  // ---- cautare + organizare pe zile ----
  const searchNorm = norm(searchQuery.trim());
  const searchedGroups = useMemo(() => (!searchNorm ? activeGroups : activeGroups.filter((g) => {
    if (norm(g.group_name).includes(searchNorm)) return true;
    return students.some((s) => s.group_id === g.id && !s.deleted_at && norm(s.name).includes(searchNorm));
  })), [activeGroups, students, searchNorm]);
  const groupsByDay = useMemo(() => DAYS.map((d) => ({
    ...d,
    groups: searchedGroups
      .filter((g) => g.day_of_week === d.id)
      .sort((a, b) => (a.time_of_day || '99:99').localeCompare(b.time_of_day || '99:99')),
  })), [searchedGroups]);
  const unscheduledGroups = useMemo(
    () => searchedGroups.filter((g) => !DAYS.some((d) => d.id === g.day_of_week)),
    [searchedGroups]
  );

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

  // Crearea claselor e rezervata adminului (server action createClass, admin/actions.ts,
  // reverifica rolul pe server - butonul e ascuns pentru profesori, dar validarea reala e
  // acolo, nu aici). Clasa e atribuita profesorului curent vizualizat (viewedTeacherId din
  // dropdown-ul de profesori), exact ca inainte.
  async function handleCreateClass(e: React.FormEvent) {
    e.preventDefault();
    const name = createName.trim();
    const names = createForm.names.map((n) => n.trim()).filter(Boolean);
    const course = createForm.course?.trim() || null;
    if (!name) return showToast('Introdu numele clasei', 'error');
    if (names.length === 0) return showToast('Adauga cel putin un elev', 'error');
    if (totalDataCount + names.length + 1 >= 999) return showToast('Limita de date atinsa (999)', 'error');

    setBusy(true);
    const result = await createClass({
      teacherId: viewedTeacherId, groupName: name, moduleCount: createForm.module, rewardType: createForm.reward,
      dayOfWeek: createForm.day, timeOfDay: createForm.time || null, course, studentNames: names,
    });
    setBusy(false);
    if (!result.ok) return showToast(result.error, 'error');

    setGroups((gs) => [...gs, result.group]);
    setStudents((ss) => [...ss, ...result.students]);

    setModal({ type: null });
    setCreateForm({ module: 1, count: 1, reward: 'stars', names: [''], day: 'luni', time: '', course: null });
    setCreateName(buildAutoClassName(1, 'luni', ''));
    setCreateCourseCustom(false);
    showToast('Clasa creata cu succes!');
    // Invalideaza Router Cache-ul Next.js, ca navigarea ulterioara catre alta pagina
    // (Diplome, Registru) sau un back/forward in acest tab sa aduca mereu date proaspete,
    // nu un instantaneu cache-uit de dinainte de creare - vezi comentariul de la `router`.
    router.refresh();
  }

  async function handleEditClass(e: React.FormEvent, groupId: string) {
    e.preventDefault();
    const name = editClassName.trim();
    if (!name) return showToast('Introdu numele clasei', 'error');
    const course = editClassCourse?.trim() || null;
    const group = getGroupById(groupId);
    setBusy(true);
    const ok = await patchGroup(groupId, { group_name: name, day_of_week: editClassDay, time_of_day: editClassTime || null, course });
    if (!ok) { setBusy(false); return; }

    // Doar admin: daca a fost aleasa o alta valoare in dropdown-ul de transfer, cascadeaza
    // teacher_id-ul pe grupa + elevi + lectii + prezenta (vezi transferClassTeacher).
    if (isAdmin && group && editClassTransferTeacherId && editClassTransferTeacherId !== group.teacher_id) {
      const result = await transferClassTeacher(groupId, editClassTransferTeacherId);
      setBusy(false);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      setModal({ type: null });
      showToast('Clasa a fost transferată cu succes!');
      await reloadViewedTeacherData();
      router.refresh();
      return;
    }

    setBusy(false);
    setModal({ type: null });
    showToast('Clasa actualizata!');
    // Numele/ziua/ora editate aici sunt citite prin group_id din orice alt ecran (Diplome,
    // Registru) - nu sunt duplicate in alt tabel. Router.refresh() le tine proaspete si
    // acolo, dincolo de acest tab, fara ca utilizatorul sa dea refresh manual.
    router.refresh();
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
    router.refresh();
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
    router.refresh();
  }

  async function permanentDeleteGroup(groupId: string) {
    await supabase.from('tracker_students').delete().eq('group_id', groupId);
    const { error } = await supabase.from('tracker_groups').delete().eq('id', groupId);
    if (error) return showToast('Eroare', 'error');
    setStudents((ss) => ss.filter((s) => s.group_id !== groupId));
    setGroups((gs) => gs.filter((g) => g.id !== groupId));
    setModal({ type: null });
    showToast('Clasa stearsa permanent');
    router.refresh();
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

    setBusy(true);
    const { data, error } = await supabase.from('tracker_students')
      .insert(patch).select().single();
    setBusy(false);
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

  // Total real de prezente (istoric + curent) - istoric = presence_count (setat manual din
  // Editeaza Elev), curent = prezente/recuperari inregistrate efectiv in aplicatie. Baza
  // pentru task-urile "🚨 Task-uri Urgente" de diploma, la fiecare 16 prezente.
  function totalPresencesFor(studentId: string) {
    const student = students.find((s) => s.id === studentId);
    return studentLessonCount(studentId) + (student?.presence_count ?? 0);
  }

  // Verifica daca elevul a atins un nou prag de 16 prezente si, daca da, deschide popup-ul
  // de celebrare (o singura data per prag per sesiune - vezi shownMilestonesRef) - apelata
  // dupa fiecare marcare "Prezent"/"Recuperat" din setAttendanceStatus, cu totalul deja
  // calculat de acolo (nu recitim aici, ca sa evitam closure-ul invechit peste attendance).
  function checkDiplomaMilestone(studentId: string, total: number) {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    if (total <= 0 || total % 16 !== 0) return;
    if (total <= student.last_diploma_issued_milestone) return;
    if (student.pending_diploma_milestone) return;
    const key = `${studentId}-${total}`;
    if (shownMilestonesRef.current.has(key)) return;
    shownMilestonesRef.current.add(key);
    launchConfetti('🎓');
    setDiplomaMilestonePopup({ studentId, milestone: total });
  }


  // Trimite catre admini (prin ruta noastra /api/diploma-milestone-alerts, proxy server-side
  // catre Pabbly) un eveniment de task de diploma - 'acknowledged' la "Am inteles" pe popup,
  // 'completed' la "Am trimis diploma" din dashboard. Trimitem doar studentId + milestone +
  // status - ruta reciteste ea insasi numele elevului, clasa si telefonul profesorului direct
  // din DB (audit securitate M-2: nu mai trimitem "de incredere" date pe care clientul le-ar
  // putea falsifica dintr-un request manual; teacherPhone ramane mereu proaspat, citit din
  // profilul autentificat la fiecare cerere, nu dintr-un prop care putea ramane invechit).
  async function sendDiplomaMilestoneAlert(
    student: TrackerStudent, milestone: number, status: 'acknowledged' | 'completed'
  ) {
    try {
      await fetch('/api/diploma-milestone-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id, milestone, status }),
      });
    } catch (error) {
      console.error('DIPLOMA MILESTONE ALERT ERROR:', error);
    }
  }

  // "Am inteles" pe popup-ul de celebrare - deschide taskul pe dashboard (pending_diploma_milestone).
  // Butonul ramane dezactivat (acknowledgingMilestone) cat timp request-ul e in desfasurare,
  // ca un dublu-click sa nu trimita alerta de doua ori - popup-ul se inchide abia la final.
  async function handleAcknowledgeDiplomaMilestone() {
    if (!diplomaMilestonePopup || acknowledgingMilestone) return;
    const { studentId, milestone } = diplomaMilestonePopup;
    const student = students.find((s) => s.id === studentId);
    if (!student) { setDiplomaMilestonePopup(null); return; }
    setAcknowledgingMilestone(true);
    await patchStudent(studentId, { pending_diploma_milestone: milestone });
    await sendDiplomaMilestoneAlert(student, milestone, 'acknowledged');
    setAcknowledgingMilestone(false);
    setDiplomaMilestonePopup(null);
  }

  // "✅ Am trimis diploma" din dashboard - inchide taskul si marcheaza pragul ca finalizat,
  // ca sa nu redeclansam popup-ul pentru acelasi multiplu de 16. patchStudent e deja optimist
  // (actualizeaza local inainte de raspunsul serverului), deci elevul dispare instant din
  // Task-uri Urgente; markingDiplomaSentIds blocheaza doar un eventual dublu-click pe acelasi buton.
  async function handleMarkDiplomaSent(student: TrackerStudent) {
    const milestone = student.pending_diploma_milestone;
    if (!milestone || markingDiplomaSentIds.has(student.id)) return;
    setMarkingDiplomaSentIds((s) => new Set(s).add(student.id));
    const ok = await patchStudent(student.id, { last_diploma_issued_milestone: milestone, pending_diploma_milestone: null });
    if (ok) {
      await sendDiplomaMilestoneAlert(student, milestone, 'completed');
      showToast('Diploma a fost marcată ca trimisă!');
    }
    setMarkingDiplomaSentIds((s) => { const next = new Set(s); next.delete(student.id); return next; });
  }


  // "✅ Recuperat" / "❌ Nu mai e nevoie" pe cardul de recuperare din Task-uri Urgente - ambele
  // inchid complet alerta curenta (pending_makeups, absence_date, contorul/cooldown-ul de
  // notificari SI is_scheduled, toate la 0/null/false); patchStudent e deja optimist, deci
  // cardul dispare instant din dashboard. Singura diferenta intre butoane e mesajul aratat
  // profesorului dupa succes.
  async function handleMakeupResolved(student: TrackerStudent, outcome: 'done' | 'dismiss') {
    if (markingMakeupIds.has(student.id)) return;
    setMarkingMakeupIds((s) => new Set(s).add(student.id));
    const ok = await patchStudent(student.id, {
      pending_makeups: 0, absence_date: null, makeup_notification_count: 0, last_makeup_notification: null, is_scheduled: false,
    });
    setMarkingMakeupIds((s) => { const next = new Set(s); next.delete(student.id); return next; });
    if (!ok) return;
    if (outcome === 'done') {
      setMakeupDoneNotice(true);
    } else {
      showToast('Alertă ștearsă');
    }
  }

  // "📅 Programat" pe cardul de recuperare - profesorul confirma ca a stabilit deja o data cu
  // parintele. Foloseste ACELASI webhook/ruta ca "Trimite Notificare" (doar action diferit -
  // vezi /api/makeup-notification-alerts), care trimite o alerta dedicata catre admin, apoi
  // seteaza is_scheduled=true - cardul isi ascunde "Trimite Notificare"/"Nu mai e nevoie".
  async function handleMarkMakeupScheduled(student: TrackerStudent) {
    if (markingMakeupIds.has(student.id) || student.is_scheduled) return;
    setMarkingMakeupIds((s) => new Set(s).add(student.id));
    try {
      const res = await fetch('/api/makeup-notification-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id, action: 'makeup_scheduled' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return showToast(json?.error ?? 'Eroare', 'error');
      setStudents((ss) => ss.map((s) => (s.id === student.id ? { ...s, is_scheduled: true } : s)));
      showToast('Recuperare marcată ca programată!');
    } finally {
      setMarkingMakeupIds((s) => { const next = new Set(s); next.delete(student.id); return next; });
    }
  }

  // Click pe "🔔 Trimite Notificare" - "ore de liniste": intre 20:00 si 8:00 (ora Bucuresti,
  // indiferent de fusul orar al dispozitivului) blocam complet actiunea, inainte sa apuce sa
  // deschida pop-up-ul de confirmare "Ai sloturi disponibile?".
  function handleOpenMakeupNotifyConfirm(student: TrackerStudent) {
    const hour = getBucharestHour();
    if (hour >= 20 || hour < 8) {
      showToast('Nu e posibil la ora asta să trimiți notificări. Revino mâine de la 8:00 dimineața.', 'error');
      return;
    }
    setMakeupNotifyConfirm(student);
  }

  // "Trimite Notificare" pe cardul de recuperare - permis oricand la prima trimitere (count 0),
  // apoi necesita minim 48h de la ultima trimitere; peste 3 trimiteri butonul se dezactiveaza
  // complet (vezi canSendMakeupNotification mai jos, folosit si pentru disabled pe buton).
  function canSendMakeupNotification(student: TrackerStudent) {
    const count = student.makeup_notification_count ?? 0;
    if (count >= 3) return false;
    if (count === 0) return true;
    if (!student.last_makeup_notification) return true;
    const hoursSinceLast = (Date.now() - new Date(student.last_makeup_notification).getTime()) / (1000 * 60 * 60);
    return hoursSinceLast >= 48;
  }

  // Confirmarea "Ai sloturi/date disponibile in calendar?" apare inainte de a trimite efectiv
  // notificarea - profesorul trebuie sa verifice calendarul de recuperari inainte sa promita
  // ceva parintelui. "Nu" doar inchide popup-ul, fara alt efect.
  async function handleConfirmMakeupNotification(student: TrackerStudent) {
    setMakeupNotifyConfirm(null);
    if (markingMakeupIds.has(student.id) || !canSendMakeupNotification(student)) return;
    setMarkingMakeupIds((s) => new Set(s).add(student.id));
    try {
      // Doar studentId - ruta reciteste ea insasi tot restul (elev, telefoane/email-uri de
      // parinte, contorul si cooldown-ul de notificari, plus profilul profesorului pentru
      // teacherName/teacherPhone/calendarLink) direct din DB, prin clientul cu sesiunea
      // profesorului (RLS ii blocheaza accesul la un elev care nu e al lui) - nu mai trimitem
      // noi valorile "de incredere", ca sa nu poata fi falsificate dintr-un request manual
      // (ex. consola browser-ului).
      const res = await fetch('/api/makeup-notification-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return showToast('Eroare', 'error');
      setStudents((ss) => ss.map((s) => (s.id === student.id
        ? { ...s, makeup_notification_count: json.makeup_notification_count, last_makeup_notification: json.last_makeup_notification }
        : s)));
      showToast('Notificare trimisă!');
    } finally {
      setMarkingMakeupIds((s) => { const next = new Set(s); next.delete(student.id); return next; });
    }
  }

  async function handleEditStudent(e: React.FormEvent, studentId: string) {
    e.preventDefault();
    const name = editStudentName.trim();
    if (!name) return showToast('Introdu numele elevului', 'error');
    // Suprascrierea manuala de Modul/Lectie devine noul punct de pornire: decalajul se
    // recalculeaza ca diferenta fata de lectiile deja inregistrate automat in aplicatie,
    // ca de acum incolo calculele viitoare sa continue exact de la M/L introdus manual.
    const clampedModule = Math.max(1, Math.round(numOrZero(editStudentModule)));
    const clampedLesson = Math.min(16, Math.max(1, Math.round(numOrZero(editStudentLesson))));
    const desiredTotal = totalLessonsFor(clampedModule, clampedLesson);
    const lessonOffset = desiredTotal - studentLessonCount(studentId);
    const stars = Math.min(MAX_HISTORICAL_COUNT, Math.max(0, Math.round(numOrZero(editStudentStars))));
    const presences = Math.min(MAX_HISTORICAL_COUNT, Math.max(0, Math.round(numOrZero(editStudentPresences))));
    const absences = Math.min(MAX_HISTORICAL_COUNT, Math.max(0, Math.round(numOrZero(editStudentAbsences))));
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
    setBusy(true);
    const ok = await patchStudent(studentId, patch);
    setBusy(false);
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

  // Trimite catre Pabbly (Green API) un WhatsApp cu link-ul de conectare al clasei - proxy
  // server-side prin /api/connection-link-alerts (audit H-1: webhook-ul nu mai e apelat direct
  // din browser, unde URL-ul era vizibil in bundle si putea fi folosit ca relay deschis de
  // oricine, chiar neautentificat). Payload-ul trimis catre Pabbly ramane neschimbat - doar
  // constructia lui s-a mutat server-side. Necesita cel putin un telefon de parinte, editabil
  // doar de admin - vezi PARTEA 1 (GDPR).
  //
  // Validarea telefonului NU se mai face aici, pe baza starii locale - un profesor nu primeste
  // deloc parent_phones in payload-ul initial al paginii (GDPR, vezi progress/page.tsx), deci
  // `student.parent_phones` e mereu gol pentru el, chiar daca adminul a completat un numar real.
  // Ruta server (route.ts) citeste direct din DB cu sesiunea profesorului - RLS pe
  // tracker_students e la nivel de RAND ("teacher_id = auth.uid()"), nu de coloana, deci
  // intoarce corect telefonul real pentru elevii profesorului. Validarea reala (telefon
  // lipsa / elev negasit) se afiseaza din raspunsul rutei; un eventual esec al webhook-ului
  // extern (502) ramane fire-and-forget, ca sa nu blocam UI-ul de un hiccup temporar Pabbly.
  async function handleSendNotification(student: TrackerStudent) {
    setNotifyState((s) => ({ ...s, [student.id]: 'loading' }));
    try {
      const res = await fetch('/api/connection-link-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id }),
      });
      if (res.status === 400 || res.status === 404) {
        const json = await res.json().catch(() => null);
        setNotifyState((s) => ({ ...s, [student.id]: 'idle' }));
        showToast(json?.error ?? 'Eroare', 'error');
        return;
      }
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
    let ok = false;
    try {
      // Trimitem doar studentId + status - ruta reciteste ea insasi numele elevului, clasa
      // si telefoanele de parinte direct din DB (audit securitate M-2: nu mai trimitem
      // "de incredere" date pe care clientul le-ar putea falsifica dintr-un request manual).
      const res = await fetch('/api/admin-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id, status }),
      });
      ok = res.ok;
    } catch (error) {
      console.error('ADMIN ALERT REQUEST ERROR:', error);
    }
    setConnectedState((s) => ({ ...s, [student.id]: 'idle' }));
    setNotifyState((s) => ({ ...s, [student.id]: 'idle' }));
    if (ok) showToast('Alertă trimisă către admini!');
    else showToast('Alerta nu a putut fi trimisă către admini. Încearcă din nou.', 'error');
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

  // Salveaza link-ul de calendar recuperari - prin API (ocoleste RLS-ul de pe profiles, care
  // permite update doar adminului), nu direct din client ca patchGroup. Trimitem explicit
  // viewedTeacherId (profesorul al carui dashboard e afisat acum), nu doar contul logat -
  // altfel adminul care previzualizeaza profesorul B ar edita mereu propriul lui link (bug
  // raportat: "linkul e acelasi pentru toti"). Ruta ignora acest camp pentru non-admini.
  async function handleSaveMakeupLink(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = makeupLinkDraft.trim();
    const normalized = trimmed && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;
    setSavingMakeupLink(true);
    try {
      const res = await fetch('/api/makeup-calendar-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: normalized || null, teacherId: viewedTeacherId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return showToast('Eroare', 'error');
      setMakeupCalendarLink(normalized || null);
      setModal({ type: null });
      showToast(normalized ? 'Link recuperări salvat!' : 'Link recuperări șters');
    } finally {
      setSavingMakeupLink(false);
    }
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

  // Creeaza o lectie noua (sedinta) pentru o grupa. Tipul se deduce AUTOMAT din numarul de
  // elevi (1 = individuala, >1 = grup) - fara alegere manuala.
  //
  // Doua numere DISTINCTE, cu roluri diferite:
  // - session_number: contor STRICT crescator si unic per grupa (constraint in DB) - a cata
  //   sedinta FIZICA e aceasta, in ordine cronologica. Nu se inghata NICIODATA - alimenteaza
  //   sortarea/dropdown-ul de lectii si Payslip-ul din /registru (fiecare sedinta tinuta conteaza
  //   acolo, indiferent de prezenta).
  // - curriculum_index: pozitia REALA in materie (afisata ca M{x}/L{y}) - NU se calculeaza din
  //   ultima lectie fizica (session_number), ci din cea mai AVANSATA lectie marcata "Efectuata"
  //   (is_taught = true, adica cu minim un Prezent/Recuperat) din TOT istoricul grupei - vezi
  //   is_taught, recalculat dinamic in setAttendanceStatus la fiecare marcare, inclusiv la
  //   editarea unei lectii trecute. Asta garanteaza ca daca profesorul repara retroactiv o
  //   lectie mai veche (ex. o marcheaza "Recuperat" dupa ce initial fusese 100% absenta),
  //   lectia noua propusa avanseaza corect, chiar daca intre timp mai exista incercari esuate
  //   ulterioare (tot "Neefectuate", inghetate la acelasi index).
  async function createLesson(groupId: string, lessonDate: string, lessonTime: string) {
    const group = getGroupById(groupId);
    if (!group) return undefined;
    const groupLessons = lessons.filter((l) => l.group_id === groupId);
    // Daca e prima lectie fizica a clasei, nu repornim de la 1: continuam de la cel mai mare
    // istoric manual (lesson_offset) setat pe elevii clasei din Editeaza Elev - altfel o clasa
    // ai carei elevi au deja 7 lectii in spate ar afisa gresit "L1" la prima sedinta noua.
    const nextSessionNumber = groupLessons.length === 0
      ? Math.max(0, ...getStudentsForGroup(groupId).map((s) => s.lesson_offset)) + 1
      : Math.max(...groupLessons.map((l) => l.session_number)) + 1;

    let nextCurriculumIndex: number;
    if (groupLessons.length === 0) {
      nextCurriculumIndex = nextSessionNumber;
    } else {
      const taughtLessons = groupLessons.filter((l) => l.is_taught);
      if (taughtLessons.length === 0) {
        // Nicio lectie efectuata inca vreodata (toate incercarile de pana acum au fost 100%
        // absente) - indexul ramane la baza initiala, identica pentru toate lectiile de pana
        // acum (lantul nu a avansat niciodata).
        nextCurriculumIndex = groupLessons[0].curriculum_index;
      } else {
        const mostAdvancedTaught = taughtLessons.reduce((max, l) => (l.curriculum_index > max.curriculum_index ? l : max));
        nextCurriculumIndex = mostAdvancedTaught.curriculum_index + 1;
      }
    }

    const activeCount = getStudentsForGroup(groupId).length;
    const format = activeCount <= 1 ? 'individual' : 'grup';
    const { data, error } = await supabase.from('tracker_lessons')
      .insert({
        teacher_id: group.teacher_id, group_id: groupId, session_number: nextSessionNumber,
        curriculum_index: nextCurriculumIndex,
        lesson_date: lessonDate, lesson_time: lessonTime || null, format,
      })
      .select().single();
    if (error || !data) { showToast('Eroare la crearea lectiei', 'error'); return undefined; }
    setLessons((ls) => [...ls, data as TrackerLesson]);
    showToast(`Lectia ${nextCurriculumIndex} creata!`);
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
  ): Promise<TrackerAttendance | undefined> {
    const student = students.find((s) => s.id === studentId);
    if (!student) return undefined;
    const group = getGroupById(student.group_id);
    if (!group) return undefined;

    // O lectie poate fi salvata chiar daca marcheaza 100% dintre elevi Absenti - nu blocam in
    // acest caz (vezi regula de business: se inregistreaza absentele normal). Indexul de materie
    // nu avanseaza totusi pentru ei, pentru ca M/L per elev (computeModuleLesson) se calculeaza
    // strict din numarul de prezente/recuperari (status 'present'/'made_up'), niciodata din
    // 'absent' - deci un elev 100% absent la aceasta lectie ramane automat la acelasi index,
    // fara sa mai fie nevoie de vreo verificare speciala aici.
    const current = attendance.find((a) => a.lesson_id === lessonId && a.student_id === studentId);
    const prevStarCount = current?.star_count ?? 0;
    const nextStarCount = status === 'absent' ? 0 : prevStarCount;
    const nextRecoveryDate = status === 'made_up' ? (recoveryDate ?? current?.recovery_date ?? nowDate()) : null;
    const nextRecoveryTime = status === 'made_up' ? (recoveryTime ?? current?.recovery_time ?? null) : null;
    // O recuperare de grup (recovery_group_id) ramane valabila doar cat timp statusul e tot
    // 'made_up' SI data nu s-a schimbat - altfel randul nu mai apartine aceleiasi sesiuni reale
    // (vezi popup-ul "Este o recuperare de grup?" din handleSubmitRecovery), deci se rupe din
    // grup si redevine o recuperare individuala pana e regrupat explicit.
    const dateChanged = (current?.recovery_date ?? null) !== nextRecoveryDate;
    const nextRecoveryGroupId = status === 'made_up' && !dateChanged ? (current?.recovery_group_id ?? null) : null;
    // Calculat ACUM (inainte de orice setAttendance) - altfel am citi starea veche din
    // closure dupa upsert, pentru ca setAttendance nu actualizeaza sincron variabila locala.
    const wasCounted = current?.status === 'present' || current?.status === 'made_up';
    const willBeCounted = status === 'present' || status === 'made_up';
    const newTotalPresences = totalPresencesFor(studentId) + (willBeCounted ? 1 : 0) - (wasCounted ? 1 : 0);

    const previousAttendance = attendance;
    if (current) {
      setAttendance((as) => as.map((a) => (a.id === current.id
        ? { ...a, status, star_count: nextStarCount, recovery_date: nextRecoveryDate, recovery_time: nextRecoveryTime, recovery_group_id: nextRecoveryGroupId } : a)));
    } else {
      const tempId = nextLocalId();
      setAttendance((as) => [...as, {
        id: tempId, teacher_id: group.teacher_id, lesson_id: lessonId, student_id: studentId,
        status, star_count: nextStarCount, recovery_date: nextRecoveryDate, recovery_time: nextRecoveryTime,
        recovery_group_id: nextRecoveryGroupId, updated_at: new Date().toISOString(),
      }]);
    }

    const { data, error } = await supabase.from('tracker_attendance')
      .upsert(
        {
          teacher_id: group.teacher_id, lesson_id: lessonId, student_id: studentId, status, star_count: nextStarCount,
          recovery_date: nextRecoveryDate, recovery_time: nextRecoveryTime, recovery_group_id: nextRecoveryGroupId,
        },
        { onConflict: 'lesson_id,student_id' }
      )
      .select().single();

    if (error || !data) {
      setAttendance(previousAttendance);
      showToast('Eroare', 'error');
      return undefined;
    }
    setAttendance((as) => [...as.filter((a) => !(a.lesson_id === lessonId && a.student_id === studentId)), data as TrackerAttendance]);

    // Lectia e "Efectuata" (is_taught = true) daca EXISTA minim un elev Prezent SAU Recuperat -
    // cele doua statusuri sunt echivalente pentru avansarea materiei. Recalculat la FIECARE
    // marcare (nu doar la "absent"), inclusiv cand profesorul editeaza o lectie din trecut -
    // asta garanteaza ca schimbarea unui elev din Absent in Recuperat, chiar si retroactiv,
    // deblocheaza imediat indexul (vezi createLesson, care scaneaza toate lectiile "Efectuate"
    // din istoric, nu doar ultima). Alimenteaza DOAR badge-ul "Neefectuată" din Progress Tracker -
    // NU si Payslip-ul din /registru, care numara orele dupa prezenta 'present' LIVE la
    // lesson_date (vezi src/lib/registryCalc.ts), ca sa nu dubleze o lectie ratata+recuperata.
    const groupStudents = getStudentsForGroup(student.group_id);
    const hasAnyPresentOrMadeUp = groupStudents.some((gs) => {
      const st = gs.id === studentId ? status : attendance.find((a) => a.lesson_id === lessonId && a.student_id === gs.id)?.status;
      return st === 'present' || st === 'made_up';
    });
    const lesson = lessons.find((l) => l.id === lessonId);
    if (lesson && lesson.is_taught !== hasAnyPresentOrMadeUp) await patchLesson(lessonId, { is_taught: hasAnyPresentOrMadeUp });

    if (nextStarCount !== prevStarCount) await applyStarDelta(studentId, nextStarCount - prevStarCount, group);
    if (willBeCounted && !wasCounted) checkDiplomaMilestone(studentId, newTotalPresences);

    // Task-uri Urgente de recuperare: marcarea explicita "Absent" adauga o restanta;
    // anularea ei (trecerea la Prezent/Recuperat dintr-un rand deja marcat Absent) o scade
    // la loc (fara sa scada sub 0). wasAbsent se uita la statusul PRECEDENT (current), nu la
    // eticheta vizuala implicita din UI (care arata "absent" si atunci cand nu exista inca
    // niciun rand in tracker_attendance).
    const wasAbsent = current?.status === 'absent';
    const willBeAbsent = status === 'absent';
    if (willBeAbsent && !wasAbsent) {
      const nextPending = (student.pending_makeups ?? 0) + 1;
      const patch: Partial<TrackerStudent> = { pending_makeups: nextPending };
      // Prima absenta nerezolvata (0 -> 1) porneste countdown-ul de 7 zile pentru cardul
      // "🚨 Recuperare necesara" - daca mai era deja una in asteptare, nu resetam data (ramane
      // legata de alerta activa) si nici contorul/cooldown-ul de notificari.
      if (nextPending === 1) patch.absence_date = nowDate();
      await patchStudent(studentId, patch);
    } else if (!willBeAbsent && wasAbsent) {
      const nextPending = Math.max(0, (student.pending_makeups ?? 0) - 1);
      const patch: Partial<TrackerStudent> = { pending_makeups: nextPending };
      // Absenta anulata si nu mai e nicio alta in asteptare - inchidem complet alerta.
      if (nextPending === 0) {
        patch.absence_date = null;
        patch.makeup_notification_count = 0;
        patch.last_makeup_notification = null;
      }
      await patchStudent(studentId, patch);
    }
    return data as TrackerAttendance;
  }

  // Butonul "+" (lectie noua) e blocat STRICT daca ultima lectie a clasei mai are elevi
  // nemarcati (niciun status ales inca) - profesorul trebuie sa inchida complet lectia
  // curenta inainte sa treaca la urmatoarea. O lectie 100% absenta NU mai blocheaza acest
  // buton - se poate crea normal lectia urmatoare; indexul de materie ramane inghetat automat
  // pentru elevii absenti (vezi comentariul din setAttendanceStatus). Fara prima lectie a
  // clasei (groupLessons.length === 0) nu avem ce valida.
  function openNewLessonModal(groupId: string) {
    const group = groups.find((g) => g.id === groupId);
    const groupLessons = lessons.filter((l) => l.group_id === groupId);
    if (groupLessons.length > 0) {
      const lastLesson = groupLessons.reduce((max, l) => (l.session_number > max.session_number ? l : max));
      const statuses = getStudentsForGroup(groupId).map(
        (s) => attendance.find((a) => a.lesson_id === lastLesson.id && a.student_id === s.id)?.status
      );
      if (statuses.some((st) => st === undefined)) {
        setNewLessonBlockNotice('unmarked');
        return;
      }
    }
    setNewLessonForm({ date: nextDateForDay(group?.day_of_week ?? null), time: group?.time_of_day || nowTime() });
    setModal({ type: 'newLesson', groupId });
  }

  function openRecoveryModal(studentId: string, lessonId: string) {
    const current = attendance.find((a) => a.lesson_id === lessonId && a.student_id === studentId);
    setRecoveryForm({ date: current?.recovery_date ?? nowDate(), time: current?.recovery_time ?? nowTime() });
    setModal({ type: 'recoveryTypeChoice', studentId, lessonId });
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

  // Recuperare individuala (1-la-1) - alegerea "Individual" din primul pas. Se inregistreaza
  // DOAR pentru elevul curent, fara nicio legatura de grup.
  async function handleSubmitRecovery(e: React.FormEvent, studentId: string, lessonId: string) {
    e.preventDefault();
    setBusy(true);
    await setAttendanceStatus(studentId, lessonId, 'made_up', recoveryForm.date, recoveryForm.time);
    setBusy(false);
    setModal({ type: null });
  }

  // Recuperare de grup - alegerea "Grup" din primul pas. Marcheaza "Recuperat" pentru elevul
  // curent SI pentru fiecare coleg bifat in chenar, toti pe aceeasi lectie/data/ora. Daca la
  // final sunt cel putin 2 elevi marcati, genereaza un recovery_group_id comun (client-side,
  // nu avem nevoie de un tabel separat - legatura traieste direct pe randurile din
  // tracker_attendance) si il scrie pe toate randurile lor, ca sistemul sa le numere ca O
  // SINGURA sesiune platita in registru (vezi recoveryUnits din Registru.tsx), desi salveaza
  // legatura exacta cu fiecare elev bifat. Daca profesorul nu bifeaza niciun coleg, ramane o
  // recuperare individuala normala, identica cu fluxul de mai sus.
  async function handleSubmitGroupRecovery(e: React.FormEvent, studentId: string, lessonId: string, otherStudentIds: string[]) {
    e.preventDefault();
    setBusy(true);
    const rows: TrackerAttendance[] = [];
    for (const id of [studentId, ...otherStudentIds]) {
      const row = await setAttendanceStatus(id, lessonId, 'made_up', recoveryForm.date, recoveryForm.time);
      if (row) rows.push(row);
    }
    if (rows.length >= 2) {
      const groupId = crypto.randomUUID();
      const ids = rows.map((r) => r.id);
      const { error } = await supabase.from('tracker_attendance').update({ recovery_group_id: groupId }).in('id', ids);
      if (!error) setAttendance((as) => as.map((a) => (ids.includes(a.id) ? { ...a, recovery_group_id: groupId } : a)));
    }
    setBusy(false);
    setModal({ type: null });
    showToast(rows.length >= 2 ? `Recuperare de grup salvata (${rows.length} elevi)` : 'Recuperare salvata');
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
        <div className="flex items-center justify-between max-w-6xl mx-auto gap-3 flex-wrap gap-y-2">
          <h1 className="text-xl md:text-2xl font-bold shrink-0">🚀 Progress Tracker</h1>
          <div className="flex items-center gap-2 flex-wrap gap-y-2">
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
            {hasUrgentTasks && (
              <button
                onClick={goHome}
                title={`${pendingDiplomaStudents.length + pendingMakeupStudents.length} task-uri urgente - click pentru lista`}
                aria-label="Task-uri urgente"
                className="relative w-10 h-10 rounded-xl bg-black border border-[#C8F023]/40 flex items-center justify-center shrink-0 animate-pulse"
              >
                <span className="text-lg font-bold" style={{ color: '#C8F023' }}>!</span>
              </button>
            )}
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
            <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
              <h2 className="text-lg md:text-xl font-semibold">📚 Clasele Tale</h2>
              <div className="flex items-center gap-2 shrink-0">
                <MakeupLinkButton
                  link={makeupCalendarLink}
                  onOpen={() => { setMakeupLinkDraft(makeupCalendarLink ?? ''); setModal({ type: 'editMakeupLink' }); }}
                />
                {isAdmin && (
                  <button onClick={() => setModal({ type: 'createClass' })} className="tracker-btn-primary px-4 py-2 rounded-2xl font-semibold text-sm shrink-0">
                    ➕ Adauga Clasa
                  </button>
                )}
              </div>
            </div>

            <div className="relative mb-6">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
              <input
                type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cauta o clasa (ex: miercuri la 17) sau un elev..."
                className="w-full bg-gray-900 border border-gray-700 rounded-2xl pl-11 pr-4 py-3 text-white placeholder:text-gray-500"
              />
            </div>

            {hasUrgentTasks && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-400 mb-3">
                  <span className="inline-block animate-bounce">🚨</span> Task-uri Urgente
                </h3>
                <div className="space-y-2">
                  {pendingMakeupStudents.map((s) => {
                    const daysLeft = makeupDaysRemaining(s.absence_date);
                    const notifyCount = s.makeup_notification_count ?? 0;
                    const canNotify = canSendMakeupNotification(s);
                    const busy = markingMakeupIds.has(s.id);
                    return (
                      <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 bg-blue-500/10 border border-blue-500/30 rounded-2xl px-4 py-3">
                        <div className="flex flex-col gap-1.5 min-w-0">
                          <p className="text-sm break-words whitespace-normal">
                            🚨 Recuperare necesară: <span className="font-semibold">{s.short_name?.trim() || s.name}</span>
                            {' - '}Clasa <span className="font-semibold">{getGroupById(s.group_id)?.group_name ?? '?'}</span>
                          </p>
                          {daysLeft !== null && (
                            <span className={`inline-flex w-fit items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${daysLeft > 0 ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400'}`}>
                              {daysLeft > 0 ? `⏳ Mai sunt ${daysLeft} ${daysLeft === 1 ? 'zi' : 'zile'}` : '⏳ Termen depășit'}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 mt-3 w-full justify-end">
                          {!s.is_scheduled && (
                            <button
                              onClick={() => handleOpenMakeupNotifyConfirm(s)}
                              disabled={busy || !canNotify}
                              title={!canNotify && notifyCount < 3 ? 'Poti retrimite dupa 48h de la ultima notificare' : undefined}
                              className="w-full sm:w-auto bg-blue-500 hover:bg-blue-400 text-white px-3 py-2 rounded-2xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              🔔 Trimite Notificare ({notifyCount}/3)
                            </button>
                          )}
                          <button
                            onClick={() => handleMarkMakeupScheduled(s)}
                            disabled={busy || s.is_scheduled}
                            title={s.is_scheduled ? 'Recuperare deja programata' : undefined}
                            className="w-full sm:w-auto bg-cyan-500 hover:bg-cyan-400 text-white px-3 py-2 rounded-2xl font-semibold text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                          >
                            {s.is_scheduled ? '✅ Programat' : '📅 Programat'}
                          </button>
                          <button
                            onClick={() => handleMakeupResolved(s, 'done')}
                            disabled={busy}
                            className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-2 rounded-2xl font-semibold text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                          >
                            ✅ Recuperat
                          </button>
                          {!s.is_scheduled && (
                            <button
                              onClick={() => handleMakeupResolved(s, 'dismiss')}
                              disabled={busy}
                              className="w-full sm:w-auto bg-transparent hover:bg-red-500/10 border border-red-500/40 text-red-400 px-3 py-2 rounded-2xl font-semibold text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                              ❌ Nu mai e nevoie
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {pendingDiplomaStudents.map((s) => {
                    // Pragul (pending_diploma_milestone) e mereu un multiplu de 16 (vezi
                    // checkDiplomaMilestone) - calculat STRICT din prezentele individuale ale
                    // acestui elev, nu din numarul de lectii tinute la nivel de grupa (bug
                    // reparat: elevi din aceeasi grupa pot avea prezente diferite din cauza
                    // absentelor/recuperarilor, deci pragul lor de diploma nu coincide automat).
                    const { module, lesson } = computeModuleLesson(s.pending_diploma_milestone ?? 0);
                    return (
                      <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3">
                        <p className="text-sm break-words whitespace-normal min-w-0">
                          🎓 Diplomă necesară: Elevul <span className="font-semibold">{s.short_name?.trim() || s.name}</span>
                          {' '}(Grupa <span className="font-semibold">{getGroupById(s.group_id)?.group_name ?? '?'}</span>)
                          {' '}a ajuns la <span className="font-semibold">M{module} / L{lesson}</span>
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2 mt-3 w-full justify-end">
                          <Link
                            href={`/diplome?studentId=${s.id}&teacherId=${viewedTeacherId}`}
                            title="Deschide generatorul de diplome, precompletat cu cursul si elevul - alege doar modulul"
                            className="block w-full sm:w-auto sm:inline-block bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-2xl font-semibold text-sm transition-colors text-center"
                          >
                            🎓 Generează Diplomă
                          </Link>
                          <button
                            onClick={() => handleMarkDiplomaSent(s)}
                            disabled={markingDiplomaSentIds.has(s.id)}
                            className="w-full sm:w-auto bg-amber-400 hover:bg-amber-300 text-black px-3 py-2 rounded-2xl font-semibold text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                          >
                            {markingDiplomaSentIds.has(s.id) ? (
                              <span className="tracker-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                            ) : (
                              '✅ Am trimis diploma'
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                            setEditClassCourse(group.course ?? null); setEditClassCourseCustom(!isKnownCourseId(group.course ?? null));
                            setEditClassTransferTeacherId(group.teacher_id);
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
                            setEditClassCourse(group.course ?? null); setEditClassCourseCustom(!isKnownCourseId(group.course ?? null));
                            setEditClassTransferTeacherId(group.teacher_id);
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
              isAdmin={isAdmin}
              onCreate={() => {
                setCreateForm({ module: 1, count: 1, reward: 'stars', names: [''], day: 'luni', time: '', course: null });
                setCreateName(buildAutoClassName(1, 'luni', ''));
                setCreateCourseCustom(false);
                setModal({ type: 'createClass' }); setMenuOpen(false);
              }}
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
              <label className="block text-sm font-semibold mb-2">Ora <span className="text-gray-500 font-normal">(format 24h)</span></label>
              <TimeInput
                value={createForm.time} onChange={(time) => setCreateForm((f) => ({ ...f, time }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">
                Numele Clasei <span className="text-gray-500 font-normal">(actualizat automat din Modul + Ziua + Ora, dar poti scrie peste el)</span>
              </label>
              <input
                type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} required
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
              <CourseGrid
                value={createForm.course} custom={createCourseCustom}
                onSelect={(course) => setCreateForm((f) => ({ ...f, course }))}
                onEnterCustom={() => { setCreateCourseCustom(true); setCreateForm((f) => ({ ...f, course: '' })); }}
                onExitCustom={() => { setCreateCourseCustom(false); setCreateForm((f) => ({ ...f, course: null })); }}
              />
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
                <label className="block text-sm font-semibold mb-2">Ora <span className="text-gray-500 font-normal">(optional, format 24h)</span></label>
                <TimeInput
                  value={editClassTime} onChange={setEditClassTime}
                  className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">
                  Numele Clasei <span className="text-gray-500 font-normal">(actualizat automat la schimbarea zilei/orei, dar poti scrie peste el)</span>
                </label>
                <input
                  type="text" value={editClassName} onChange={(e) => setEditClassName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white" required autoFocus
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Curs (pentru diplome)</label>
                <CourseGrid
                  value={editClassCourse} custom={editClassCourseCustom}
                  onSelect={setEditClassCourse}
                  onEnterCustom={() => { setEditClassCourseCustom(true); setEditClassCourse(''); }}
                  onExitCustom={() => { setEditClassCourseCustom(false); setEditClassCourse(null); }}
                />
              </div>
              {isAdmin && (
                <div className="mb-4">
                  <label className="block text-sm font-semibold mb-2">Transferă clasa la alt profesor</label>
                  <select
                    value={editClassTransferTeacherId}
                    onChange={(e) => setEditClassTransferTeacherId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
                  >
                    {teacherOptions.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>
              )}
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
                <button type="button" disabled={busy} onClick={() => setModal({ type: 'confirmDeleteClass', groupId: group.id })} className="bg-red-500 hover:bg-red-600 px-4 py-3 rounded-2xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  🗑️
                </button>
                <button type="button" disabled={busy} onClick={() => setModal({ type: null })} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  Anuleaza
                </button>
                <button type="submit" disabled={busy} className="flex-1 tracker-btn-primary py-3 rounded-2xl font-semibold">
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
              <button type="button" disabled={busy} onClick={() => setModal({ type: null })} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                ✖️ Anuleaza
              </button>
              <button type="submit" disabled={busy} className="flex-1 tracker-btn-primary py-3 rounded-2xl font-semibold">
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
                      type="number" min={1} value={editStudentModule} onWheel={blurOnWheel}
                      onChange={(e) => setEditStudentModule(numericInputValue(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
                    />
                  </div>
                  <span className="mt-5 text-gray-500 font-bold">/</span>
                  <div className="flex-1">
                    <span className="block text-[11px] text-gray-500 mb-1">Lecție</span>
                    <input
                      type="number" min={1} max={16} value={editStudentLesson} onWheel={blurOnWheel}
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
                  type="number" min={0} max={MAX_HISTORICAL_COUNT} value={editStudentStars} onWheel={blurOnWheel}
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
                      type="number" min={0} max={MAX_HISTORICAL_COUNT} value={editStudentPresences} onWheel={blurOnWheel}
                      onChange={(e) => setEditStudentPresences(numericInputValue(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="block text-[11px] text-gray-500 mb-1">Absențe</span>
                    <input
                      type="number" min={0} max={MAX_HISTORICAL_COUNT} value={editStudentAbsences} onWheel={blurOnWheel}
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
                  disabled={busy || getStudentsForGroup(student.group_id).length <= 1}
                  onClick={() => setModal({ type: 'confirmDeleteStudent', studentId: student.id })}
                  className="bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 rounded-2xl font-semibold transition-colors"
                >
                  🗑️
                </button>
                <button type="button" disabled={busy} onClick={() => setModal({ type: null })} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  Anuleaza
                </button>
                <button type="submit" disabled={busy} className="flex-1 tracker-btn-primary py-3 rounded-2xl font-semibold">
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
                  <TimeInput
                    value={newLessonForm.time} onChange={(v) => setNewLessonForm((f) => ({ ...f, time: v }))}
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

      {modal.type === 'editMakeupLink' && (
        <ModalShell onClose={() => setModal({ type: null })}>
          <h3 className="text-xl font-bold mb-4 text-[#C8F023]">📅 Link Recuperări</h3>
          <form onSubmit={handleSaveMakeupLink}>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Link calendar recuperări</label>
              <input
                type="text" value={makeupLinkDraft} onChange={(e) => setMakeupLinkDraft(e.target.value)}
                placeholder="https://calendar.google.com/..."
                className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white" autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setModal({ type: null })} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors">
                Anuleaza
              </button>
              <button type="submit" disabled={savingMakeupLink} className="flex-1 tracker-btn-primary py-3 rounded-2xl font-semibold disabled:opacity-70 disabled:cursor-not-allowed">
                ✅ Salveaza
              </button>
            </div>
          </form>
        </ModalShell>
      )}

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
                <button type="submit" disabled={busy} className="flex-1 tracker-btn-primary py-3 rounded-2xl font-semibold">
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
        const otherStudents = getStudentsForGroup(lesson.group_id).filter((s) => s.id !== modal.studentId);
        return (
          <GroupRecoveryFormModal
            student={student}
            otherStudents={otherStudents}
            date={recoveryForm.date}
            time={recoveryForm.time}
            busy={busy}
            onDateChange={(v) => setRecoveryForm((f) => ({ ...f, date: v }))}
            onTimeChange={(v) => setRecoveryForm((f) => ({ ...f, time: v }))}
            onClose={() => setModal({ type: null })}
            onSubmit={(e, otherIds) => handleSubmitGroupRecovery(e, modal.studentId, modal.lessonId, otherIds)}
          />
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

      {/* Popup automat "Task Urgent" de diploma - la fiecare 16 prezente (istoric + curent). */}
      {diplomaMilestonePopup && (() => {
        const student = students.find((s) => s.id === diplomaMilestonePopup.studentId);
        if (!student) return null;
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80">
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
            <div className="bg-gray-900 rounded-3xl p-6 w-full max-w-md max-h-[90%] overflow-y-auto tracker-card-shadow text-center relative z-10">
              <div className="text-5xl mb-4">🎓</div>
              <h3 className="text-xl font-bold mb-2 text-[#C8F023]">Felicitări!</h3>
              <p className="text-sm text-gray-400 mb-6">
                🎉 Felicitări! Elevul <span className="text-white font-semibold">{student.short_name?.trim() || student.name}</span> a ajuns la {diplomaMilestonePopup.milestone} prezențe!
                {' '}Te rugăm să generezi diploma și să o trimiți pe grupul adminilor în maxim 3 zile.
              </p>
              <button
                onClick={handleAcknowledgeDiplomaMilestone} disabled={acknowledgingMilestone}
                className="tracker-btn-primary w-full py-3 rounded-2xl font-semibold disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {acknowledgingMilestone ? <span className="tracker-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Am înțeles'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Blocaj pe butonul "+" (lectie noua) - vezi openNewLessonModal. Singurul motiv posibil
          ramas: mai lipseste statusul vreunui elev la lectia curenta (100% absenti nu mai
          blocheaza nimic - vezi setAttendanceStatus). */}
      {newLessonBlockNotice && (
        <ModalShell onClose={() => setNewLessonBlockNotice(null)}>
          <div className="text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h3 className="text-xl font-bold mb-2 text-[#C8F023]">Prezență incompletă</h3>
            <p className="text-sm text-gray-400 mb-6">
              Nu poți crea o lecție nouă dacă nu ai completat statusul pentru toți elevii din lecția curentă. Trebuie să bifezi Prezent, Absent sau Recuperat pentru fiecare copil în parte.
            </p>
            <button
              onClick={() => setNewLessonBlockNotice(null)}
              className="tracker-btn-primary w-full py-3 rounded-2xl font-semibold"
            >
              Am înțeles
            </button>
          </div>
        </ModalShell>
      )}

      {/* Popup de confirmare dupa "✅ Recuperare efectuata" pe cardul din Task-uri Urgente. */}
      {makeupDoneNotice && (
        <ModalShell onClose={() => setMakeupDoneNotice(false)}>
          <div className="text-center">
            <div className="text-5xl mb-4">🔄</div>
            <h3 className="text-xl font-bold mb-2 text-[#C8F023]">Recuperare marcată!</h3>
            <p className="text-sm text-gray-400 mb-6">
              Perfect! Acum mergi în clasa elevului și modifică iconița în &bdquo;Recuperat&rdquo; pe fișa lui.
            </p>
            <button
              onClick={() => setMakeupDoneNotice(false)}
              className="tracker-btn-primary w-full py-3 rounded-2xl font-semibold"
            >
              Am înțeles
            </button>
          </div>
        </ModalShell>
      )}

      {/* Confirmare inainte de "Trimite Notificare" - profesorul trebuie sa verifice calendarul
          de recuperari inainte sa promita un slot parintelui. */}
      {makeupNotifyConfirm && (
        <ModalShell onClose={() => setMakeupNotifyConfirm(null)}>
          <div className="text-center">
            <div className="text-5xl mb-4">🔔</div>
            <h3 className="text-xl font-bold mb-2 text-[#C8F023]">Verifică Recuperările</h3>
            <p className="text-sm text-gray-400 mb-4">
              Verifică link-ul de recuperare. Ai sloturi/date disponibile în calendar?
            </p>
            {makeupCalendarLink && (
              <a
                href={makeupCalendarLink} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#C8F023] border border-[#C8F023]/40 hover:border-[#C8F023] hover:bg-[#C8F023]/10 rounded-2xl px-3 py-2 mb-6 transition-colors"
              >
                <Calendar size={15} /> Deschide calendarul <ExternalLink size={13} className="opacity-70" />
              </a>
            )}
            <div className="flex gap-3">
              <button
                type="button" onClick={() => setMakeupNotifyConfirm(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors"
              >
                Nu
              </button>
              <button
                type="button" onClick={() => handleConfirmMakeupNotification(makeupNotifyConfirm)}
                className="flex-1 tracker-btn-primary py-3 rounded-2xl font-semibold"
              >
                Da
              </button>
            </div>
          </div>
        </ModalShell>
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

// Chenarul de recuperare de grup: data/ora sesiunii + lista celorlalti colegi din grupa
// elevului curent, fiecare cu bifa proprie. Elevul pentru care s-a apasat "Recuperat" e mereu
// inclus (nu are bifa - e implicit); profesorul bifeaza rapid EXACT care alti colegi au fost
// si ei prezenti la aceeasi sesiune (de ex. 2 din 3 copii). Indiferent cati colegi sunt bifati,
// handleSubmitGroupRecovery scrie un singur recovery_group_id comun pe toate randurile lor -
// sesiunea conteaza ca o singura ora platita in registru (vezi recoveryUnits din Registru.tsx).
function GroupRecoveryFormModal({
  student, otherStudents, date, time, busy, onDateChange, onTimeChange, onClose, onSubmit,
}: {
  student: TrackerStudent; otherStudents: TrackerStudent[]; date: string; time: string; busy: boolean;
  onDateChange: (v: string) => void; onTimeChange: (v: string) => void; onClose: () => void;
  onSubmit: (e: React.FormEvent, otherStudentIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-xl font-bold mb-2 text-[#C8F023]">👥 Recuperare de grup</h3>
      <p className="text-sm text-gray-400 mb-4">
        Sesiune de grup pentru <span className="text-white font-semibold">{student.name}</span>
      </p>
      <form onSubmit={(e) => onSubmit(e, [...selected])}>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Data</label>
            <input
              type="date" value={date} onChange={(e) => onDateChange(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white" required autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Ora</label>
            <TimeInput value={time} onChange={onTimeChange} className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white" />
          </div>
        </div>
        {otherStudents.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-semibold mb-2">Cine altcineva a participat?</p>
            <p className="text-xs text-gray-400 mb-3">
              Bifează colegii din grupă care au participat și ei la această sesiune. Indiferent câți bifezi, sesiunea
              va conta ca <span className="text-white font-semibold">o singură oră</span> plătită în registru.
            </p>
            <div className="space-y-2">
              {otherStudents.map((s) => (
                <label
                  key={s.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer transition-colors ${selected.has(s.id) ? 'bg-blue-500/15 border-blue-500/40' : 'bg-gray-800 border-gray-700'}`}
                >
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="w-4 h-4 accent-[#C8F023]" />
                  <span className="font-semibold text-sm">{s.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors">
            ✖️ Anuleaza
          </button>
          <button type="submit" disabled={busy} className="flex-1 tracker-btn-primary py-3 rounded-2xl font-semibold">
            ✅ Confirma recuperarea
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

const HISTORY_STATUS_CONFIG: Record<AttendanceStatus, { label: string; icon: React.ReactNode; pill: string; dot: string }> = {
  present: { label: 'Prezent', icon: <Check size={14} strokeWidth={3} />, pill: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30', dot: 'bg-emerald-500' },
  absent: { label: 'Absent', icon: <XIcon size={14} strokeWidth={3} />, pill: 'bg-red-500/15 text-red-400 border border-red-500/30', dot: 'bg-red-500' },
  made_up: { label: 'Recuperat', icon: <RotateCcw size={13} strokeWidth={2.5} />, pill: 'bg-blue-500/15 text-blue-400 border border-blue-500/30', dot: 'bg-blue-500' },
};
// Nicio lectie nemarcata inca pentru elev (record null) nu e "Absent" - e doar nemarcata.
const UNMARKED_HISTORY_CONFIG = { label: 'Nemarcat', icon: <span className="text-[10px] leading-none">–</span>, pill: 'bg-white/5 text-gray-400 border border-white/10', dot: 'bg-gray-500' };

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
  const statusOf = (r: TrackerAttendance | null): AttendanceStatus | undefined => r?.status;
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
              const cfg = status ? HISTORY_STATUS_CONFIG[status] : UNMARKED_HISTORY_CONFIG;
              const starCount = record?.star_count ?? 0;
              const starEligible = status === 'present' || status === 'made_up';
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
  recentGroups, deletedCount, onOpenClass, onCreate, onTrash, isAdmin,
}: {
  recentGroups: TrackerGroup[]; deletedCount: number;
  onOpenClass: (id: string) => void; onCreate: () => void; onTrash: () => void; isAdmin: boolean;
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
        {isAdmin && (
          <button onClick={onCreate} className="w-full tracker-btn-primary py-3 rounded-2xl font-semibold">
            ➕ Adauga Clasa Noua
          </button>
        )}
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
          className="flex-1 min-w-0 sm:min-w-[200px] bg-transparent text-sm placeholder:text-gray-500 focus:outline-none"
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

// Buton "📅 Link Recuperari" de langa "+ Adauga Clasa" - identic ca stil/structura cu
// MeetLinkControl de mai sus (buton punctat cand nu exista link, pill + creion cand exista),
// dar editarea se face printr-un modal (ModalShell), nu inline - vezi modal.type ===
// 'editMakeupLink' si handleSaveMakeupLink mai sus, in ProgressTracker.
function MakeupLinkButton({ link, onOpen }: { link: string | null; onOpen: () => void }) {
  if (!link) {
    return (
      <button
        onClick={onOpen}
        className="flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-[#C8F023] border border-dashed border-gray-700 hover:border-[#C8F023]/50 rounded-2xl px-3 py-2 transition-colors"
      >
        <Calendar size={15} /> + Setează Link Recuperări
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={link} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm font-semibold text-[#C8F023] border border-[#C8F023]/40 hover:border-[#C8F023] hover:bg-[#C8F023]/10 rounded-2xl px-3 py-2 transition-colors max-w-[240px]"
        title={link}
      >
        <Calendar size={15} className="shrink-0" />
        <span className="truncate">Link Recuperări</span>
        <ExternalLink size={13} className="shrink-0 opacity-70" />
      </a>
      <button
        onClick={onOpen} title="Editeaza link-ul"
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
                  {formatModuleLesson(selectedLesson.curriculum_index)}
                  <ChevronDown size={16} className={`text-gray-500 transition-transform ${lessonMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {!selectedLesson.is_taught && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-red-500/15 border border-red-500/40 px-2 py-0.5 text-[10px] font-bold text-red-400 align-middle">
                    Neefectuată
                  </span>
                )}

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
                            {formatModuleLesson(l.curriculum_index)} - {new Date(l.lesson_date).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            {l.lesson_time ? `, ${l.lesson_time}` : ''}
                          </span>
                          <span className="shrink-0 rounded-md border border-[#C8F023]/40 bg-black px-1.5 py-0.5 text-[10px] font-semibold text-[#C8F023]">
                            {LESSON_FORMAT_LABEL[l.format]}
                          </span>
                          {!l.is_taught && (
                            <span className="shrink-0 rounded-md border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                              Neefectuată
                            </span>
                          )}
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
              // Nemarcat inca (niciun rand in tracker_attendance) != 'absent' - ramane starea
              // neutra pana cand profesorul apasa explicit un buton, ca sa nu sugereze vizual
              // ca prezenta a fost deja marcata cand de fapt nu s-a intamplat nimic.
              const status: AttendanceStatus | undefined = record?.status;
              const starCount = record?.star_count ?? 0;
              const starDisabled = status !== 'present' && status !== 'made_up';
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
                      type="button"
                      onClick={() => !starDisabled && onCycleStar(s.id, selectedLesson.id)}
                      disabled={starDisabled}
                      title={starDisabled ? 'Elevul trebuie sa fie prezent sau sa fi recuperat lectia' : `Tema facuta x${starCount} - click pentru a schimba`}
                      className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors ${starDisabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10'}`}
                    >
                      <Star
                        size={18} strokeWidth={2}
                        className={starCount > 0 && !starDisabled ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-gray-500'}
                      />
                      {starCount > 1 && !starDisabled && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-400 px-0.5 text-[9px] font-bold leading-none text-black">
                          {starCount}
                        </span>
                      )}
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

      <div className="grid w-full grid-cols-8 gap-1 mb-4">
        {Array.from({ length: 16 }, (_, i) => (
          <div key={i} className="flex items-center justify-center">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${i < progressInLevel ? 'bg-[#C8F023]' : 'bg-gray-700 opacity-50'}`}>
              {rewardEmoji}
            </div>
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
