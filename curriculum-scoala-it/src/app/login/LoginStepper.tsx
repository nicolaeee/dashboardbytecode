import { Fragment } from 'react';

const STEPS = ['Platformă', 'Curs', 'Registru', 'Tracker'];

// Stepper decorativ, in bucla: arata cele 4 module ale panoului, unul dupa altul,
// la infinit — pur CSS (vezi .login-stepper-* in globals.css), fara JS/timers.
export default function LoginStepper() {
  return (
    <div className="login-stepper glass rounded-xl border border-white/10 px-3 py-3.5 sm:rounded-2xl sm:px-5 sm:py-6" aria-hidden>
      <div className="flex items-start gap-1.5 sm:gap-2">
        {STEPS.map((label, i) => (
          <Fragment key={label}>
            <div className="flex w-12 shrink-0 flex-col items-center gap-1.5 text-center sm:w-16 sm:gap-2">
              <span
                className={`login-stepper-dot login-stepper-dot-${i + 1} grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold sm:h-9 sm:w-9 sm:text-[11px]`}
              >
                {i + 1}
              </span>
              <span className="text-[9px] font-medium leading-tight text-white/50 sm:text-[11px]">{label}</span>
            </div>

            {i < STEPS.length - 1 && (
              <span className="login-stepper-line relative mt-[14px] h-[2px] flex-1 overflow-hidden rounded-full bg-white/10 sm:mt-[18px]">
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
