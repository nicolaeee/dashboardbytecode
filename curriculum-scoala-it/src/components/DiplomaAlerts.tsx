'use client';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type DiplomaGroup = { id: string; group_name: string; lessonCount: number };

/**
 * Alerta "trebuie sa trimiti diploma" - apare in coltul din stanga-jos al panoului ca o
 * iconita rosie compacta ce palpaie, exact cand o grupa atinge un NOU multiplu de 16 lectii
 * tinute total (16, 32, 48...). Click pe iconita -> se extinde o lista clara cu fiecare
 * grupa in parte si propriul buton de confirmare.
 *
 * Datele vin din /api/diploma-alerts (server), NU direct din client cu RLS: adminul foloseste
 * acolo clientul cu service_role, ca sa vada TOATE grupele scolii indiferent de profesor,
 * chiar daca politicile RLS "adminul gestioneaza toate X" n-au fost inca rulate pe baza de
 * date. Profesorul continua sa vada strict propriile grupe.
 */
export default function DiplomaAlerts() {
  const [pending, setPending] = useState<DiplomaGroup[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/diploma-alerts', { cache: 'no-store' });
      if (!res.ok) return;
      const { groups } = (await res.json()) as { groups: DiplomaGroup[] };
      setPending(groups);
    } catch {
      // eroare de retea - incercam din nou la urmatorul refresh programat
    }
  }, []);

  useEffect(() => {
    refresh();
    // Poll periodic (independent de Realtime/RLS) + Realtime best-effort pentru actualizare instant.
    const poll = setInterval(refresh, 45000);
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 400);
    };
    const channel = supabase.channel('diploma-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracker_lessons' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracker_groups' }, scheduleRefresh)
      .subscribe();
    return () => {
      clearInterval(poll);
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  useEffect(() => {
    if (pending.length === 0) setOpen(false);
  }, [pending.length]);

  async function markSent(group: DiplomaGroup) {
    setBusyId(group.id);
    const milestone = Math.floor(group.lessonCount / 16) * 16;
    try {
      const res = await fetch('/api/diploma-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: group.id, milestone }),
      });
      const { ok } = (await res.json()) as { ok: boolean };
      if (ok) setPending((p) => p.filter((g) => g.id !== group.id));
    } finally {
      setBusyId(null);
    }
  }

  if (pending.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[60] flex flex-col-reverse items-start gap-2">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Alerte diplome"
        title="Trebuie sa trimiti diploma pentru una sau mai multe grupe"
        className={`relative grid h-12 w-12 place-items-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/50 ring-2 ring-red-400/70 transition-transform hover:scale-105 ${open ? '' : 'animate-pulse'}`}
      >
        <span className="text-2xl font-black leading-none">!</span>
        {pending.length > 1 && (
          <span className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-red-600 text-[11px] font-bold ring-2 ring-red-600">
            {pending.length}
          </span>
        )}
      </button>

      {open && (
        <div className="flex flex-col gap-2 max-w-xs">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-red-400">
            🎓 Grupe ce necesită diplomă ({pending.length})
          </p>
          {pending.map((g) => (
            <div key={g.id} className="glass-strong rounded-2xl border border-line border-l-4 border-l-red-500 px-4 py-3 shadow-glow-sm">
              <p className="text-[13px] leading-snug text-white">
                Trebuie să trimiți diploma pentru grupa <span className="font-semibold text-brand-500">{g.group_name}</span>
              </p>
              <button
                onClick={() => markSent(g)}
                disabled={busyId === g.id}
                className="mt-2 rounded-lg bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-black transition hover:bg-brand-600 disabled:opacity-50"
              >
                ✓ Diplomă trimisă
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
