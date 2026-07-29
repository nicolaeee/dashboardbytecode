'use client';
import { useActionState, useState } from 'react';
import { signIn } from '@/app/auth-actions';
import { Button, Card, Field, Input, Modal } from '@/components/ui';
import LoginStepper from './LoginStepper';

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

      <div className="relative z-10 flex min-h-screen flex-col lg:grid lg:grid-cols-[1.05fr_1fr]">
        {/* Panoul de identitate: chiar ierarhia platformei, desenată ca traseu — vizibil pe orice ecran */}
        <section className="flex flex-col justify-between bg-night/60 px-5 py-8 text-white sm:px-8 sm:py-10 lg:px-12 lg:py-12">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 font-mono text-sm font-bold text-black">{'</>'}</span>
            <span className="font-display text-[15px] font-semibold">ByteCode Dashboard</span>
          </div>

          <div className="mt-6 max-w-md lg:mt-0">
            <h1 className="font-display text-[26px] font-semibold leading-[1.15] sm:text-[30px] lg:text-[34px]">
              Panou de control pentru profesor.
            </h1>
            <p className="mt-2.5 text-[13px] leading-relaxed text-white/45 sm:mt-3 sm:text-sm">
              Totul într-un singur loc: platforma de conținut, cursurile, registrul și tracker-ul de progres.
            </p>
            <div className="mt-5 sm:mt-7 lg:mt-9">
              <LoginStepper />
            </div>
          </div>

          <p className="mt-6 max-w-sm text-xs leading-relaxed text-white/40 sm:mt-8 sm:text-sm sm:text-white/[.45] lg:mt-0">
            Accesul profesorilor la module și lecții este acordat de administrator.
          </p>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:py-16">
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
