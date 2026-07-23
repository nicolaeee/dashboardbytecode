import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';

/**
 * Profilul utilizatorului logat, sau null.
 * Memoizat per-request (React cache): layout.tsx și page.tsx apelează amândouă
 * requireUser()/requireAdmin(), altfel fiecare navigare ar face de 2 ori
 * auth.getUser() + select pe profiles.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return (data as Profile) ?? null;
});

/** Orice utilizator autentificat și activ. */
export async function requireUser(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect('/login');
  if (!profile.is_active) redirect('/login?motiv=inactiv');
  return profile;
}

/** Doar administrator - altfel întoarcem profesorul în zona lui. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireUser();
  if (profile.role !== 'admin') redirect('/curriculum');
  return profile;
}
