'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Singleton: un singur client (deci o singura conexiune Realtime + un singur
// GoTrueClient) per tab de browser, indiferent din cate componente e apelat
// createClient(). Fara asta, fiecare componenta client (Shell -> RealtimeRefresher +
// DiplomaAlerts, plus ProgressTracker/Registru/CurriculumManager) isi crea propriul
// client separat -> 3 conexiuni websocket redundante deschise simultan pentru
// ACELASI utilizator, ceea ce inmulteste inutil consumul din cota de conexiuni
// Realtime a proiectului Supabase cand sunt multi profesori conectati simultan.
let client: SupabaseClient | undefined;

export function createClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
