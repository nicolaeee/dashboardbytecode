'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button, Card, Field, Input } from '@/components/ui';

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setHasSession(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('Parola trebuie să aibă minim 8 caractere.');
    if (password !== confirm) return setError('Parolele nu coincid.');

    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) return setError('Nu am putut schimba parola. Încearcă din nou.');
    await supabase.auth.signOut();
    setDone(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-5">
      <Card className="w-full max-w-sm p-7">
        <h2 className="font-display text-xl font-semibold">Setează o parolă nouă</h2>

        {done ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-xl border border-brand-300/40 bg-brand-50 px-3 py-2.5 text-sm text-brand-600">
              Parola a fost schimbată cu succes.
            </p>
            <Link href="/login" className="text-sm font-medium text-brand-500 hover:text-brand-600">
              Intră în cont →
            </Link>
          </div>
        ) : !ready ? (
          <p className="mt-6 text-sm text-lock">Se verifică linkul…</p>
        ) : !hasSession ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-xl border border-[#FF6B6B]/30 bg-[#FF6B6B]/10 px-3 py-2.5 text-sm text-[#FF6B6B]">
              Linkul de resetare este invalid sau a expirat.
            </p>
            <Link href="/forgot-password" className="text-sm font-medium text-brand-500 hover:text-brand-600">
              Solicită un link nou
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field label="Parola nouă">
              <Input
                type="password" autoComplete="new-password" placeholder="minim 8 caractere" required
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Confirmă parola">
              <Input
                type="password" autoComplete="new-password" required
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>

            {error && (
              <p className="rounded-xl border border-[#FF6B6B]/30 bg-[#FF6B6B]/10 px-3 py-2 text-[13px] text-[#FF6B6B]">{error}</p>
            )}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? 'Se salvează…' : 'Salvează parola'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
