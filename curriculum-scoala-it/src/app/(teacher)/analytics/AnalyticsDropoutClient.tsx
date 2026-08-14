'use client';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TeacherDropoutStat } from '@/lib/types';
import { Card } from '@/components/ui';

const WINDOW_OPTIONS = [
  { months: 1, label: '1 lună' },
  { months: 3, label: '3 luni' },
  { months: 4, label: '4 luni' },
  { months: 6, label: '6 luni' },
  { months: 12, label: '12 luni' },
];

/**
 * Dashboard "Rata de Abandon" (modul nou, activabil per profesor de Super Admin) - din totalul
 * de elevi asociați unui profesor în fereastra aleasă, câți au ajuns la statusul 'dropped_out'.
 * Un elev TRANSFERAT la alt profesor iese complet din contorul profesorului vechi (vezi
 * teacher_dropout_stats în schema.sql) - transferul nu afectează niciodată rata de abandon.
 */
export default function AnalyticsDropoutClient({
  isAdmin, initialMonths, initialStats,
}: { isAdmin: boolean; initialMonths: number; initialStats: TeacherDropoutStat[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [months, setMonths] = useState(initialMonths);
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);

  async function changeWindow(newMonths: number) {
    setMonths(newMonths);
    setLoading(true);
    const { data, error } = await supabase.rpc('teacher_dropout_stats', { p_months: newMonths });
    setLoading(false);
    if (error) { console.error('TEACHER DROPOUT STATS ERROR:', error); return; }
    setStats((data ?? []) as TeacherDropoutStat[]);
  }

  const maxRate = Math.max(1, ...stats.map((s) => s.dropout_rate));
  const schoolTotal = stats.reduce((sum, s) => sum + Number(s.total_students), 0);
  const schoolDropped = stats.reduce((sum, s) => sum + Number(s.dropped_students), 0);
  const schoolRate = schoolTotal === 0 ? 0 : Math.round((schoolDropped / schoolTotal) * 1000) / 10;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="tag">Analytics</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Rata de Abandon per Profesor</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          {isAdmin
            ? 'Din totalul de elevi asociați fiecărui profesor în fereastra aleasă, câți au statusul „Abandon”. Transferul la alt profesor nu contează ca abandon.'
            : 'Rata ta de abandon pe fereastra aleasă. Transferul unui elev la alt profesor nu contează ca abandon.'}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {WINDOW_OPTIONS.map((o) => (
          <button
            key={o.months} onClick={() => changeWindow(o.months)} disabled={loading}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition disabled:opacity-60 ${
              months === o.months ? 'bg-brand-500 text-black' : 'bg-slate-150 text-ink/70 hover:bg-slate-150/70'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {isAdmin && (
        <Card className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-[13px] text-lock">Rata de abandon - toată școala</p>
            <p className="font-display text-2xl font-semibold">{schoolRate}%</p>
          </div>
          <p className="text-sm text-lock">{schoolDropped} din {schoolTotal} elevi</p>
        </Card>
      )}

      {stats.length === 0 ? (
        <Card className="px-4 py-10 text-center text-sm text-lock">Niciun profesor cu elevi în această fereastră.</Card>
      ) : (
        <Card className="divide-y divide-line">
          {stats.map((s) => (
            <div key={s.teacher_id} className="px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-[15px] font-semibold text-ink">{s.teacher_name}</p>
                <p className="shrink-0 text-sm text-lock">{s.dropped_students} din {s.total_students} elevi</p>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-150">
                  <div
                    className="h-full rounded-full bg-[#FF6B6B]"
                    style={{ width: `${maxRate === 0 ? 0 : (s.dropout_rate / maxRate) * 100}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right font-display text-sm font-semibold tabular-nums text-ink">
                  {s.dropout_rate}%
                </span>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
