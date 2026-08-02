'use client';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CourseId } from '@/lib/types';
import { DIPLOMA_MODULES } from '@/lib/diplomas';

export type DiplomaGroupStudent = { id: string; name: string; progress: number };
export type DiplomaGroupAlert = { id: string; group_name: string; lessonCount: number; course: CourseId | null; students: DiplomaGroupStudent[] };

/** Modulul tocmai incheiat de grupa (lessonCount lectii tinute = M{n} / L16), clampat la
 * modulele cu sablon de diploma disponibile (1-4). */
export function completedModuleFor(lessonCount: number) {
  const n = Math.floor(lessonCount / 16);
  return Math.min(Math.max(n, DIPLOMA_MODULES[0]), DIPLOMA_MODULES[DIPLOMA_MODULES.length - 1]);
}

/**
 * Grupele care au atins un nou multiplu de 16 lectii tinute si asteapta diploma trimisa -
 * date din /api/diploma-alerts, STRICT pentru profesorul dat prin `teacherId` (acelasi
 * profesor vizualizat curent din dropdown-ul "🚨 Task-uri Urgente" - vezi selectedTeacherId
 * / viewedTeacherId in ProgressTracker.tsx). Un admin poate cere datele oricarui profesor,
 * dar niciodata ale tuturor deodata - izolare stricta per profesor. Actualizat printr-un
 * poll la 45s + Realtime best-effort pe tracker_lessons/tracker_groups, si de fiecare data
 * cand se schimba profesorul vizualizat.
 *
 * Extras din DiplomaAlerts.tsx (widget-ul plutitor original) ca sa fie reutilizabil si din
 * "🚨 Task-uri Urgente" (ProgressTracker.tsx), fara sa duplicam fetch-ul/poll-ul/subscriptia.
 */
export function useDiplomaGroupAlerts(teacherId: string) {
  const [pending, setPending] = useState<DiplomaGroupAlert[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/diploma-alerts?teacherId=${encodeURIComponent(teacherId)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const { groups } = (await res.json()) as { groups: DiplomaGroupAlert[] };
      setPending(groups);
    } catch {
      // eroare de retea - incercam din nou la urmatorul refresh programat
    }
  }, [teacherId]);

  useEffect(() => {
    refresh();
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

  const markSent = useCallback(async (group: DiplomaGroupAlert) => {
    setBusyId(group.id);
    try {
      const res = await fetch('/api/diploma-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: group.id, milestone: Math.floor(group.lessonCount / 16) * 16 }),
      });
      const { ok } = (await res.json()) as { ok: boolean };
      if (ok) setPending((p) => p.filter((g) => g.id !== group.id));
      return ok;
    } finally {
      setBusyId(null);
    }
  }, []);

  return { pending, markSent, busyId, refresh };
}
