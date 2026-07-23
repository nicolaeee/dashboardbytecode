'use client';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button, Card, Field, Input } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPending(false);
    if (error) { setError('Nu am putut trimite emailul. Încearcă din nou.'); return; }
    setDone(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-5">
      <Card className="w-full max-w-sm p-7">
        <h2 className="font-display text-xl font-semibold">Recuperează parola</h2>
        <p className="mt-1 text-sm text-lock">Îți trimitem un link de resetare pe email.</p>

        {done ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-xl border border-brand-300/40 bg-brand-50 px-3 py-2.5 text-sm text-brand-600">
              Dacă adresa există în sistem, vei primi un email cu instrucțiuni de resetare.
            </p>
            <Link href="/login" className="text-sm font-medium text-brand-500 hover:text-brand-600">
              ← Înapoi la login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field label="Email">
              <Input
                type="email" autoComplete="email" placeholder="nume@scoala.ro" required
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            {error && (
              <p className="rounded-xl border border-[#FF6B6B]/30 bg-[#FF6B6B]/10 px-3 py-2 text-[13px] text-[#FF6B6B]">{error}</p>
            )}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? 'Se trimite…' : 'Trimite linkul de resetare'}
            </Button>
            <Link href="/login" className="block text-center text-sm text-lock hover:text-ink">
              ← Înapoi la login
            </Link>
          </form>
        )}
      </Card>
    </div>
  );
}
