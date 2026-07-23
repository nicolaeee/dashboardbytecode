'use client';
import { useActionState, useState } from 'react';
import { signIn } from '@/app/auth-actions';
import { Button, Card, Field, Input, Modal } from '@/components/ui';

const HIERARCHY = ['Platformă', 'Curs', 'Modul', 'Lecție'];

// Configurate static (nu random) - randomizarea la render ar produce mismatch de hidratare.
const PARTICLES = [
  { left: '4%', size: 14, duration: 18, delay: -2, color: 'rgba(200,240,35,.55)' },
  { left: '13%', size: 8, duration: 22, delay: -14, color: 'rgba(139,92,246,.45)' },
  { left: '22%', size: 20, duration: 26, delay: -6, color: 'rgba(200,240,35,.30)' },
  { left: '33%', size: 10, duration: 16, delay: -9, color: 'rgba(255,255,255,.25)' },
  { left: '44%', size: 16, duration: 24, delay: -18, color: 'rgba(236,72,153,.35)' },
  { left: '55%', size: 7, duration: 20, delay: -4, color: 'rgba(200,240,35,.5)' },
  { left: '64%', size: 22, duration: 28, delay: -20, color: 'rgba(139,92,246,.30)' },
  { left: '74%', size: 12, duration: 19, delay: -11, color: 'rgba(200,240,35,.4)' },
  { left: '85%', size: 9, duration: 23, delay: -7, color: 'rgba(255,255,255,.2)' },
  { left: '93%', size: 17, duration: 25, delay: -16, color: 'rgba(200,240,35,.3)' },
];

function FloatingParticles() {
  return (
    <div className="particle-field pointer-events-none" aria-hidden>
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="particle"
          style={{
            left: p.left, width: p.size, height: p.size, background: p.color,
            animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, null as { error?: string } | null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      {/* Glow-uri ambientale, discrete, in spatele cardului de login */}
      <div className="ambient-glow pointer-events-none absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" aria-hidden />
      <div className="ambient-glow pointer-events-none absolute -bottom-40 right-1/4 h-[28rem] w-[28rem] rounded-full bg-purple-500/15 blur-3xl" style={{ animationDelay: '-4s' }} aria-hidden />
      <FloatingParticles />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* Panoul de identitate: chiar ierarhia platformei, desenată ca traseu */}
        <section className="hidden flex-col justify-between bg-night/60 px-12 py-12 text-white lg:flex">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 font-mono text-sm font-bold text-black">{'</>'}</span>
            <span className="font-display text-[15px] font-semibold">Bytecode School</span>
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
          <Card className="w-full max-w-sm p-7 shadow-glow-sm">
            <h2 className="font-display text-xl font-semibold">Intră în cont</h2>
            <p className="mt-1 text-sm text-lock">Folosește datele primite de la administrator.</p>

            <form action={formAction} className="mt-6 space-y-4">
              <Field label="Email">
                <Input name="email" type="email" autoComplete="email" placeholder="nume@scoala.ro" required />
              </Field>
              <Field label="Parolă">
                <Input name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
              </Field>

              <div className="text-right">
                <button
                  type="button" onClick={() => setShowForgotPassword(true)}
                  className="text-[13px] font-medium text-lock hover:text-brand-500"
                >
                  Ai uitat parola?
                </button>
              </div>

              {state?.error && (
                <p className="rounded-xl border border-[#FF6B6B]/30 bg-[#FF6B6B]/10 px-3 py-2 text-[13px] text-[#FF6B6B]">{state.error}</p>
              )}

              <Button type="submit" disabled={pending} className="w-full">
                {pending ? 'Se verifică…' : 'Intră în cont'}
              </Button>
            </form>
          </Card>
        </section>
      </div>

      <Modal
        open={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
        title="Ai uitat parola?"
        footer={<Button onClick={() => setShowForgotPassword(false)}>Am înțeles</Button>}
      >
        <p className="text-sm leading-relaxed text-ink/80">
          Dacă ai uitat parola, contactează administratorul școlii pentru a ți-o reseta manual.
        </p>
      </Modal>
    </div>
  );
}
