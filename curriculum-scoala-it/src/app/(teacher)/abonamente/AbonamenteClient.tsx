'use client';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { StudentStatus, SubscriptionType } from '@/lib/types';
import { STUDENT_STATUS_LABELS, SUBSCRIPTION_TYPE_LABELS } from '@/lib/types';
import { Badge, Button, Card } from '@/components/ui';

export type SubscriptionRow = {
  id: string;
  teacherId: string;
  name: string;
  groupName: string;
  /** null pentru un profesor (vede doar propriii elevi, coloana n-are rost) */
  teacherName: string | null;
  status: StudentStatus;
  subscriptionType: SubscriptionType | null;
  remaining: number;
};

const STATUS_TONE: Record<StudentStatus, 'ok' | 'brand' | 'lock'> = {
  active: 'ok', paused: 'brand', dropped_out: 'lock',
};

/**
 * Dashboard "Pachete / Abonamente" (modul nou, activabil per profesor de Super Admin) - sold de
 * lecții pe elev, cu acțiunile cerute direct pe rând: adaugă lecții (reînnoire abonament),
 * schimbă status (Activ/Pauză/Abandon). Scrie direct pe tracker_students prin clientul Supabase
 * (RLS): un profesor doar pe elevii lui, adminul pe oricare - același tipar ca patchStudent din
 * ProgressTracker.tsx, dar independent de acea componentă (pagină proprie, nu un modal).
 */
export default function AbonamenteClient({
  viewerId, isAdmin, initialRows,
}: { viewerId: string; isAdmin: boolean; initialRows: SubscriptionRow[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<'all' | StudentStatus>('all');
  const [search, setSearch] = useState('');

  const visibleRows = rows.filter((r) => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (search.trim() && !r.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  async function changeStatus(row: SubscriptionRow, status: StudentStatus) {
    if (status === 'dropped_out' && !confirm(`Marchezi pe ${row.name} ca Abandon? Elevul a plecat din școală.`)) return;
    setBusyId(row.id);
    const { error } = await supabase.from('tracker_students')
      .update({ status, status_changed_at: new Date().toISOString(), status_changed_by: viewerId })
      .eq('id', row.id);
    setBusyId(null);
    if (error) { console.error('ABONAMENTE STATUS UPDATE ERROR:', error); return; }
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status } : r)));
  }

  async function changeSubscriptionType(row: SubscriptionRow, subscriptionType: SubscriptionType | '') {
    setBusyId(row.id);
    const { error } = await supabase.from('tracker_students')
      .update({ subscription_type: subscriptionType || null }).eq('id', row.id);
    setBusyId(null);
    if (error) { console.error('ABONAMENTE TYPE UPDATE ERROR:', error); return; }
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, subscriptionType: subscriptionType || null } : r)));
  }

  async function addLessons(row: SubscriptionRow) {
    const amount = amounts[row.id] ?? 4;
    if (amount <= 0) return;
    const nextRemaining = row.remaining + amount;
    setBusyId(row.id);
    const { error } = await supabase.from('tracker_students').update({ total_lessons_remaining: nextRemaining }).eq('id', row.id);
    if (!error) {
      const { error: logError } = await supabase.from('tracker_lesson_transactions').insert({
        student_id: row.id, teacher_id: row.teacherId, delta: amount, reason: 'purchase',
        balance_after: nextRemaining, created_by: viewerId,
      });
      if (logError) console.error('LESSON TRANSACTION LOG ERROR:', logError);
    }
    setBusyId(null);
    if (error) { console.error('ADD LESSONS ERROR:', error); return; }
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, remaining: nextRemaining } : r)));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="tag">Pachete / Abonamente</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Sold de lecții</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          {isAdmin ? 'Toți elevii, din toate clasele.' : 'Elevii tăi.'} Soldul scade automat la fiecare prezență
          marcată în Progress Tracker; adaugă lecții aici când părintele reînnoiește abonamentul.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Caută elev…"
          className="glass h-9 w-full max-w-xs rounded-xl border border-line px-3 text-sm text-ink placeholder:text-lock/70 focus:border-brand-300 focus:outline-none"
        />
        {(['all', 'active', 'paused', 'dropped_out'] as const).map((f) => (
          <button
            key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
              filter === f ? 'bg-brand-500 text-black' : 'bg-slate-150 text-ink/70 hover:bg-slate-150/70'
            }`}
          >
            {f === 'all' ? 'Toți' : STUDENT_STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {visibleRows.length === 0 ? (
        <Card className="px-4 py-10 text-center text-sm text-lock">Niciun elev găsit.</Card>
      ) : (
        <Card className="divide-y divide-line">
          {visibleRows.map((row) => (
            <div key={row.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">{row.name}</p>
                <p className="truncate text-[13px] text-lock">
                  📖 {row.groupName}{row.teacherName ? ` · ${row.teacherName}` : ''}
                </p>
              </div>

              <Badge tone={STATUS_TONE[row.status]}>{STUDENT_STATUS_LABELS[row.status]}</Badge>

              <select
                value={row.subscriptionType ?? ''}
                disabled={busyId === row.id}
                onChange={(e) => changeSubscriptionType(row, e.target.value as SubscriptionType | '')}
                className="glass h-9 rounded-xl border border-line px-2.5 text-[13px] text-ink focus:outline-none"
              >
                <option value="" className="bg-night text-ink">Fără pachet</option>
                {Object.entries(SUBSCRIPTION_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value} className="bg-night text-ink">{label}</option>
                ))}
              </select>

              <span className={`w-10 shrink-0 text-center font-display text-lg font-semibold tabular-nums ${row.remaining <= 2 ? 'text-[#FF6B6B]' : 'text-ink'}`}>
                {row.remaining}
              </span>

              <div className="flex items-center gap-1.5">
                <input
                  type="number" min={1} value={amounts[row.id] ?? 4}
                  onChange={(e) => setAmounts((a) => ({ ...a, [row.id]: Math.max(1, Number(e.target.value) || 1) }))}
                  className="glass h-9 w-16 rounded-xl border border-line px-2 text-[13px] text-ink focus:outline-none"
                />
                <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => addLessons(row)}>
                  + Lecții
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {row.status !== 'active' && (
                  <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => changeStatus(row, 'active')}>Activ</Button>
                )}
                {row.status !== 'paused' && (
                  <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => changeStatus(row, 'paused')}>Pauză</Button>
                )}
                {row.status !== 'dropped_out' && (
                  <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => changeStatus(row, 'dropped_out')}>Abandon</Button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
