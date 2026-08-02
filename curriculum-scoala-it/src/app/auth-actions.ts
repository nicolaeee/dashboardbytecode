'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/apiSecurity';

export async function signIn(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Completează emailul și parola.' };

  // Protectie de baza contra brute-force/credential stuffing - cheie pe email (normalizat),
  // nu pe IP (usor de rotit) si nu pe user.id (inca nu exista la acest punct).
  if (!checkRateLimit(`signin:${email.toLowerCase()}`, RATE_LIMITS.AUTH_ATTEMPT.limit, RATE_LIMITS.AUTH_ATTEMPT.windowMs)) {
    return { error: 'Prea multe încercări de autentificare. Așteaptă câteva minute și încearcă din nou.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Email sau parolă greșite. Încearcă din nou.' };

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles').select('role, is_active').eq('id', user!.id).single();

  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    return { error: 'Contul este dezactivat. Contactează administratorul.' };
  }

  revalidatePath('/', 'layout');
  redirect(profile?.role === 'admin' ? '/admin/curriculum' : '/curriculum');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
