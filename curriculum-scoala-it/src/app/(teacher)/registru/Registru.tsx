'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { TrackerLesson, TrackerAttendance } from '@/lib/types';

const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];

type TeacherOption = { id: string; label: string };

export default function Registru({
  viewerId, isAdmin, teacherOptions, initialLessons, initialAttendance,
}: {
  viewerId: string; isAdmin: boolean; teacherOptions: TeacherOption[];
  initialLessons: TrackerLesson[]; initialAttendance: TrackerAttendance[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [selectedTeacherId, setSelectedTeacherId] = useState(viewerId);
  const [lessons, setLessons] = useState<TrackerLesson[]>(initialLessons);
  const [attendance, setAttendance] = useState<TrackerAttendance[]>(initialAttendance);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(() => new Date().getFullYear());

  // Raportul e generat STRICT din tracker_lessons + tracker_attendance ale Progress
  // Tracker-ului - nicio inregistrare manuala aici. Adminul poate schimba profesorul vizat.
  useEffect(() => {
    if (selectedTeacherId === viewerId) { setLessons(initialLessons); setAttendance(initialAttendance); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: l }, { data: a }] = await Promise.all([
        supabase.from('tracker_lessons').select('*').eq('teacher_id', selectedTeacherId),
        supabase.from('tracker_attendance').select('*').eq('teacher_id', selectedTeacherId).eq('status', 'made_up'),
      ]);
      if (cancelled) return;
      setLessons((l ?? []) as TrackerLesson[]);
      setAttendance((a ?? []) as TrackerAttendance[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedTeacherId, viewerId, initialLessons, initialAttendance, supabase]);

  const table = useMemo(() => {
    const rows = MONTHS.map(() => ({ grup: 0, individual: 0, recuperare: 0 }));
    for (const l of lessons) {
      const d = new Date(l.lesson_date);
      if (d.getFullYear() !== year) continue;
      if (l.format === 'individual') rows[d.getMonth()].individual += 1;
      else rows[d.getMonth()].grup += 1;
    }
    for (const a of attendance) {
      if (a.status !== 'made_up' || !a.recovery_date) continue;
      const d = new Date(a.recovery_date);
      if (d.getFullYear() !== year) continue;
      rows[d.getMonth()].recuperare += 1;
    }
    return rows;
  }, [lessons, attendance, year]);

  const totals = useMemo(() => {
    const t = { grup: 0, individual: 0, recuperare: 0 };
    table.forEach((row) => { t.grup += row.grup; t.individual += row.individual; t.recuperare += row.recuperare; });
    return t;
  }, [table]);
  const grandTotal = totals.grup + totals.individual + totals.recuperare;

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

            <div className="overflow-x-auto">
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
                    return (
                      <tr key={m} className={`border-t border-gray-800 ${rowTotal > 0 ? '' : 'text-gray-600'}`}>
                        <td className="py-1.5 pr-2 font-medium">{m}</td>
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
    </div>
  );
}
