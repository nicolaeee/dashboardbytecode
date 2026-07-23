'use client';
import { useActionState } from 'react';
import { signIn } from '@/app/auth-actions';
import { Button, Card, Field, Input } from '@/components/ui';

const HIERARCHY = ['Platformă', 'Curs', 'Modul', 'Lecție'];

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, null as { error?: string } | null);

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Panoul de identitate: chiar ierarhia platformei, desenată ca traseu */}
      <section className="hidden flex-col justify-between bg-ink px-12 py-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 font-mono text-sm font-bold">{'</>'}</span>
          <span className="font-display text-[15px] font-semibold">Curriculum · Școala de IT</span>
        </div>

        <div className="max-w-md">
          <h1 className="font-display text-[34px] font-semibold leading-[1.15]">
            Tot curriculumul, pe patru niveluri.
          </h1>
          <ol className="mt-9 space-y-0">
            {HIERARCHY.map((level, i) => (
              <li key={level} className="relative flex items-center gap-4 pb-7 last:pb-0">
                {i < HIERARCHY.length - 1 && (
                  <span className="absolute left-[13px] top-7 h-7 w-px bg-white/15" aria-hidden />
                )}
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/20 font-mono text-[11px] text-white/70">
                  {i + 1}
                </span>
                <span className="font-display text-lg">{level}</span>
              </li>
            ))}
          </ol>
        </div>

        <p className="max-w-sm text-sm leading-relaxed text-white/45">
          Accesul profesorilor la module și lecții este acordat de administrator.
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-16">
        <Card className="w-full max-w-sm p-7">
          <h2 className="font-display text-xl font-semibold">Intră în cont</h2>
          <p className="mt-1 text-sm text-lock">Folosește datele primite de la administrator.</p>

          <form action={formAction} className="mt-6 space-y-4">
            <Field label="Email">
              <Input name="email" type="email" autoComplete="email" placeholder="nume@scoala.ro" required />
            </Field>
            <Field label="Parolă">
              <Input name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
            </Field>

            {state?.error && (
              <p className="rounded-xl bg-[#FDF3F2] px-3 py-2 text-[13px] text-[#C0392B]">{state.error}</p>
            )}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? 'Se verifică…' : 'Intră în cont'}
            </Button>
          </form>
        </Card>
      </section>
    </div>
  );
}
