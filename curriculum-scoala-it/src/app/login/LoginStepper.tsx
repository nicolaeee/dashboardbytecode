import { Fragment } from 'react';

const STEPS = ['Platformă', 'Curs', 'Registru', 'Tracker'];

// Stepper decorativ, in bucla: arata cele 4 module ale panoului, unul dupa altul,
// la infinit — pur CSS (vezi .login-stepper-* in globals.css), fara JS/timers.
export default function LoginStepper() {
  return (
    <div className="login-stepper glass rounded-2xl border border-white/10 px-5 py-6" aria-hidden>
      <div className="flex items-start">
        {STEPS.map((label, i) => (
          <Fragment key={label}>
            <div className="flex w-16 shrink-0 flex-col items-center gap-2 text-center">
              <span
                className={`login-stepper-dot login-stepper-dot-${i + 1} grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold`}
              >
                {i + 1}
              </span>
              <span className="text-[11px] font-medium leading-tight text-white/50">{label}</span>
            </div>

            {i < STEPS.length - 1 && (
              <span className="login-stepper-line relative mt-[18px] h-[2px] flex-1 overflow-hidden rounded-full bg-white/10">
                <span className={`login-stepper-line-fill login-stepper-line-fill-${i + 1} absolute inset-y-0 left-0`}>
                  <span className={`login-stepper-line-head login-stepper-line-head-${i + 1}`} />
                </span>
              </span>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
