'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Doar tabelele curriculumului - tracker_groups/tracker_students au deja
// state local optimist in ProgressTracker si nu au nevoie de refresh global,
// altfel fiecare steluta apasata ar reincarca pagina tuturor conectatilor.
const CURRICULUM_TABLES = ['platforms', 'courses', 'modules', 'lessons', 'module_permissions', 'lesson_permissions'];

/**
 * Ține interfața sincronizată: orice modificare făcută de admin (curriculum sau
 * permisiuni) reîmprospătează automat pagina profesorului, fără refresh manual.
 */
export default function RealtimeRefresher() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Grupeaza mai multe schimbari rapide (ex: deblocare in masa) intr-un singur refresh.
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    let channel = supabase.channel('curriculum-live');
    for (const table of CURRICULUM_TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh);
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);
  return null;
}
