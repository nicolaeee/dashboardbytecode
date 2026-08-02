'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/apiSecurity';

/** IP-ul cererii curente, din headerele setate de proxy/edge (Vercel etc.) - 'unknown' local,
 * unde nu exista un asemenea proxy (nu e o problema, mediul local nu e expus pe internet). */
async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return h.get('x-real-ip')?.trim() || 'unknown';
}

export async function signIn(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Completează emailul și parola.' };

  const ip = await getClientIp();
  // Doua limite complementare (audit R-3): una pe IP (indiferent de email - opreste
  // credential stuffing pe multe conturi de pe aceeasi masina) si una pe IP+email (opreste
  // brute-force pe UN cont anume). Niciuna nu foloseste DOAR emailul - altfel un atacator ar
  // putea "bloca" intentionat contul altcuiva, cunoscand doar adresa lui de email, fara sa
  // afecteze incercarea reala a victimei de pe propriul IP.
  if (!checkRateLimit(`signin-ip:${ip}`, RATE_LIMITS.AUTH_ATTEMPT_IP.limit, RATE_LIMITS.AUTH_ATTEMPT_IP.windowMs)) {
    return { error: 'Prea multe încercări de autentificare. Așteaptă câteva minute și încearcă din nou.' };
  }
  if (!checkRateLimit(`signin:${ip}:${email.toLowerCase()}`, RATE_LIMITS.AUTH_ATTEMPT.limit, RATE_LIMITS.AUTH_ATTEMPT.windowMs)) {
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
