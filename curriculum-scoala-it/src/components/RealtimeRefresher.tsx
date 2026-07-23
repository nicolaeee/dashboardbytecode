'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Ține interfața sincronizată: orice modificare făcută de admin (curriculum sau
 * permisiuni) reîmprospătează automat pagina profesorului, fără refresh manual.
 */
export default function RealtimeRefresher() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('curriculum-live')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [router]);
  return null;
}
