'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signIn(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Completează emailul și parola.' };

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
  redirect(profile?.role === 'admin' ? '/admin' : '/curriculum');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
