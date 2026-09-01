'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { TrackerLesson, TrackerAttendance } from '@/lib/types';
import { computeMonthEntries, computePayslipTable, computePayslipTotals, type RegistryEntry } from '@/lib/registryCalc';

const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
const DAY_LABELS = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];
const ENTRY_CONFIG = {
  grup: { label: 'Lecție grup', icon: '👥' },
  individual: { label: 'Lecție individuală', icon: '🧑' },
  recuperare: { label: 'Recuperare', icon: '🔄' },
} as const;

type TeacherOption = { id: string; label: string };
type StudentOption = { id: string; name: string };
type GroupOption = { id: string; group_name: string };

// Index Luni=0 .. Duminica=6 (spre deosebire de Date.getDay(), unde Duminica=0).
function mondayIndexedDay(d: Date) { return (d.getDay() + 6) % 7; }

function weekOfMonth(d: Date) {
  const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
  const offset = mondayIndexedDay(firstDay);
  return Math.floor((d.getDate() - 1 + offset) / 7);
}

export default function Registru({
  viewerId, isAdmin, teacherOptions, initialLessons, initialAttendance, initialStudents, initialGroups,
}: {
  viewerId: string; isAdmin: boolean; teacherOptions: TeacherOption[];
  initialLessons: TrackerLesson[]; initialAttendance: TrackerAttendance[]; initialStudents: StudentOption[];
  initialGroups: GroupOption[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [selectedTeacherId, setSelectedTeacherId] = useState(viewerId);
  const [lessons, setLessons] = useState<TrackerLesson[]>(initialLessons);
  const [attendance, setAttendance] = useState<TrackerAttendance[]>(initialAttendance);
  const [students, setStudents] = useState<StudentOption[]>(initialStudents);
  const [groups, setGroups] = useState<GroupOption[]>(initialGroups);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  // Raportul e generat STRICT din tracker_lessons + tracker_attendance ale Progress
  // Tracker-ului - nicio inregistrare manuala aici. Adminul poate schimba profesorul vizat.
  useEffect(() => {
    setSelectedMonth(null);
    if (selectedTeacherId === viewerId) {
      setLessons(initialLessons); setAttendance(initialAttendance); setStudents(initialStudents); setGroups(initialGroups); return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: l }, { data: a }, { data: s }, { data: g }] = await Promise.all([
        supabase.from('tracker_lessons').select('*').eq('teacher_id', selectedTeacherId),
        // 'present' e necesar (nu doar 'made_up') ca sa stim care lectii au avut o sedinta
        // LIVE reala (vezi liveLessonIds in registryCalc.ts) - fara el, o lectie 100% absenta
        // si recuperata ulterior ar fi platita de doua ori.
        supabase.from('tracker_attendance').select('*').eq('teacher_id', selectedTeacherId).in('status', ['present', 'made_up']),
        supabase.from('tracker_students').select('id, name').eq('teacher_id', selectedTeacherId),
        supabase.from('tracker_groups').select('id, group_name').eq('teacher_id', selectedTeacherId),
      ]);
      if (cancelled) return;
      setLessons((l ?? []) as TrackerLesson[]);
      setAttendance((a ?? []) as TrackerAttendance[]);
      setStudents((s ?? []) as StudentOption[]);
      setGroups((g ?? []) as GroupOption[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedTeacherId, viewerId, initialLessons, initialAttendance, initialStudents, initialGroups, supabase]);

  // Toata logica de calcul (ce conteaza ca ora "grup"/"individual" vs "recuperare", fara
  // dublari) traieste in lib/registryCalc.ts, testata separat in registryCalc.test.ts -
  // NU folosim is_taught aici (acela e despre avansarea materiei, vezi ProgressTracker.tsx),
  // ci prezenta LIVE ('present') a cel putin unui elev la lesson_date.
  const table = useMemo(
    () => computePayslipTable(lessons, attendance, students, year),
    [lessons, attendance, students, year]
  );

  const totals = useMemo(() => computePayslipTotals(table), [table]);
  const grandTotal = totals.grup + totals.individual + totals.recuperare;

  const monthEntries = useMemo(() => {
    if (selectedMonth === null) return [];
    return computeMonthEntries(lessons, attendance, students, groups, year, selectedMonth);
  }, [lessons, attendance, students, groups, year, selectedMonth]);

  const monthWeeks = useMemo(() => {
    const map = new Map<number, RegistryEntry[]>();
    for (const e of monthEntries) {
      const wk = weekOfMonth(new Date(e.date));
      if (!map.has(wk)) map.set(wk, []);
      map.get(wk)!.push(e);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([wk, entries]) => {
        const byDay: RegistryEntry[][] = Array.from({ length: 7 }, () => []);
        for (const e of entries) byDay[mondayIndexedDay(new Date(e.date))].push(e);
        return { week: wk, byDay };
      });
  }, [monthEntries]);

  return (
    <div className="tracker-root -mx-5 -my-7 lg:-mx-10 lg:-my-9 min-h-screen bg-black text-white">
      <header className="glass sticky top-0 z-40 px-4 py-4 border-b border-white/10">
        <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">📒 Registru — Raport Payslip</h1>
            <p className="text-xs text-gray-400 mt-0.5">Generat automat din Progress Tracker · doar vizualizare</p>
          </div>
          {isAdmin && (
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white"
            >
              <option value={viewerId} className="bg-gray-900 text-white">Eu (propriul raport)</option>
              {teacherOptions.filter((t) => t.id !== viewerId).map((t) => (
                <option key={t.id} value={t.id} className="bg-gray-900 text-white">{t.label}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full p-4">
        {loading ? (
          <div className="flex justify-center py-16"><div className="tracker-spinner" /></div>
        ) : (
          <div className="bg-gray-900 border border-gray-700 rounded-3xl p-4 tracker-card-shadow">
            <div className="flex items-center justify-center gap-3 mb-4">
              <button onClick={() => setYear((y) => y - 1)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                <ChevronLeft size={18} />
              </button>
              <span className="font-bold text-lg">{year}</span>
              <button onClick={() => setYear((y) => y + 1)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="overflow-x-auto touch-pan-x">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="text-gray-400 text-xs uppercase tracking-wide">
                    <th className="text-left font-semibold py-2 pr-2">Luna</th>
                    <th className="text-center font-semibold py-2 px-2">Lecții Grup</th>
                    <th className="text-center font-semibold py-2 px-2">Lecții Individuale</th>
                    <th className="text-center font-semibold py-2 px-2">Recuperări</th>
                    <th className="text-center font-semibold py-2 pl-2 text-[#C8F023]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((m, i) => {
                    const row = table[i];
                    const rowTotal = row.grup + row.individual + row.recuperare;
                    const clickable = rowTotal > 0;
                    return (
                      <tr
                        key={m}
                        onClick={clickable ? () => setSelectedMonth(i) : undefined}
                        className={`border-t border-gray-800 transition-colors ${rowTotal > 0 ? '' : 'text-gray-600'} ${clickable ? 'cursor-pointer hover:bg-white/5' : ''}`}
                      >
                        <td className={`py-1.5 pr-2 font-medium ${clickable ? 'hover:text-[#C8F023] hover:underline' : ''}`}>{m}</td>
                        <td className="text-center py-1.5 px-2">{row.grup || '–'}</td>
                        <td className="text-center py-1.5 px-2">{row.individual || '–'}</td>
                        <td className="text-center py-1.5 px-2">{row.recuperare || '–'}</td>
                        <td className="text-center py-1.5 pl-2 font-bold text-[#C8F023]">{rowTotal || '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-700 font-bold">
                    <td className="py-2 pr-2">Total</td>
                    <td className="text-center py-2 px-2">{totals.grup}</td>
                    <td className="text-center py-2 px-2">{totals.individual}</td>
                    <td className="text-center py-2 px-2">{totals.recuperare}</td>
                    <td className="text-center py-2 pl-2 text-[#C8F023]">{grandTotal}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </main>

      {selectedMonth !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setSelectedMonth(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-strong tracker-card-shadow border border-white/10 rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-start justify-between gap-3 p-6 pb-4 border-b border-white/10 shrink-0">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#C8F023] mb-1">📒 Detaliu Lunar</p>
                <h3 className="text-xl font-bold">{MONTHS[selectedMonth]} {year}</h3>
                <p className="text-sm text-gray-400 mt-0.5">{monthEntries.length} lecții/recuperări</p>
              </div>
              <button
                onClick={() => setSelectedMonth(null)} aria-label="Inchide"
                className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {monthWeeks.length === 0 ? (
                <p className="text-gray-400 text-center py-10 text-sm">Nicio lecție în această lună.</p>
              ) : (
                monthWeeks.map(({ week, byDay }) => (
                  <div key={week}>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Săptămâna {week + 1}</p>
                    <div className="space-y-2">
                      {DAY_LABELS.map((dayLabel, dayIdx) => {
                        const dayEntries = byDay[dayIdx];
                        if (dayEntries.length === 0) return null;
                        return (
                          <div key={dayLabel} className="bg-white/5 border border-white/10 rounded-2xl px-3 py-2.5">
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{dayLabel}</p>
                            <div className="space-y-1.5">
                              {dayEntries.map((entry, ei) => {
                                const cfg = ENTRY_CONFIG[entry.kind];
                                return (
                                  <div key={ei} className="flex items-center gap-2 text-sm">
                                    <span>{cfg.icon}</span>
                                    <span className="flex-1">
                                      {cfg.label}{entry.sessionNumber ? ` #${entry.sessionNumber}` : ''}
                                      {/* Numele grupei careia ii apartine lectia - fara el, doua lectii din grupe
                                          diferite cazute pe aceeasi data/ora arata identic si par o dublare. */}
                                      {entry.groupName && (
                                        <span className="block text-xs text-gray-400 font-normal mt-0.5">
                                          {entry.groupName}
                                        </span>
                                      )}
                                      {/* Recuperare de grup: o singura ora, dar afisam explicit cine a participat
                                          (vezi recovery_group_id) - transparenta pentru profesor/admin in registru. */}
                                      {entry.groupStudentNames && (
                                        <span className="block text-xs text-blue-400 font-normal mt-0.5">
                                          grup · {entry.groupStudentNames.join(', ')}
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-gray-400 font-mono text-xs">
                                      {new Date(entry.date).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                      {entry.time ? ` - ${entry.time}` : ''}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
