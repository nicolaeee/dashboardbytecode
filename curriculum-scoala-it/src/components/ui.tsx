'use client';
import { X } from 'lucide-react';
import { useEffect } from 'react';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm',
  outline: 'bg-white text-ink border border-line hover:border-brand-300 hover:text-brand-600',
  ghost: 'text-lock hover:text-ink hover:bg-slate-150/60',
  danger: 'bg-white text-[#C0392B] border border-[#F2D4D0] hover:bg-[#FDF3F2]',
};

export function Button({
  variant = 'primary', size = 'md', className = '', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  const sizes = size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm';
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition
        disabled:opacity-50 disabled:cursor-not-allowed ${sizes} ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Card({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`rounded-2xl border border-line bg-white shadow-card ${className}`} />;
}

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-xl border border-line bg-white px-3 text-sm
        placeholder:text-lock/70 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 ${className}`}
    />
  );
}

export function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-line bg-white p-3 text-sm leading-relaxed
        placeholder:text-lock/70 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 ${className}`}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="block text-xs text-lock">{hint}</span>}
    </label>
  );
}

export function Modal({
  open, onClose, title, children, footer, wide,
}: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 py-10 backdrop-blur-[2px]">
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-2xl bg-white shadow-pop`}>
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Închide" className="rounded-lg p-1 text-lock hover:bg-slate-150 hover:text-ink">
            <X size={18} />
          </button>
        </header>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</footer>}
      </div>
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'brand' | 'lock' | 'ok'; children: React.ReactNode }) {
  const tones = {
    neutral: 'bg-slate-150 text-ink/70',
    brand: 'bg-brand-50 text-brand-700',
    lock: 'bg-slate-150 text-lock',
    ok: 'bg-[#E7F6F1] text-[#0E7C63]',
  }[tone];
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${tones}`}>{children}</span>;
}

export function EmptyState({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-slate-25 px-4 py-6 text-center">
      <p className="text-sm text-lock">{title}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}
