'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Foaia de jos (bottom sheet) - SINGURA componenta de acest fel din aplicatie, folosita pe
 * telefon pentru orice alegere dintr-o lista (Select.tsx sub 1024px, meniul "Mai mult" din
 * Shell.tsx). Pe desktop nu se foloseste deloc - acolo raman dropdown-urile/sidebar-ul de acum.
 *
 * - fundal OPAC (fara backdrop-filter: nu se vede textul paginii prin ea si e mult mai ieftina
 *   la randare pe telefoane slabe);
 * - maner sus + swipe in jos inchide (foaia urmeaza degetul; peste ~90px sau un swipe rapid
 *   se inchide, altfel revine);
 * - Escape, atingerea fundalului si butonul "Anulează" inchid;
 * - inaltime maxima = ecranul minus zona sigura de sus, derulare interna;
 * - intrare din jos (transform), iesire mai scurta decat intrarea; prefers-reduced-motion ->
 *   doar fade (vezi .sheet-* in globals.css).
 */
export default function BottomSheet({
  open, onClose, title, children, cancelLabel = 'Anulează', footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  cancelLabel?: string | null;
  footer?: React.ReactNode;
}) {
  // Montat cat timp e deschisa SAU ruleaza animatia de iesire - altfel foaia ar disparea brusc.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ startY: number; startT: number; active: boolean }>({ startY: 0, startT: 0, active: false });
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      setDragY(0);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => { setMounted(false); setClosing(false); setDragY(0); }, 180);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  // Escape + blocarea derularii paginii din spate cat timp foaia e deschisa.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!mounted || typeof document === 'undefined') return null;

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { startY: e.clientY, startT: performance.now(), active: true };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active) return;
    setDragY(Math.max(0, e.clientY - drag.current.startY));
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!drag.current.active) return;
    drag.current.active = false;
    const dy = Math.max(0, e.clientY - drag.current.startY);
    const velocity = dy / Math.max(1, performance.now() - drag.current.startT);
    if (dy > 90 || velocity > 0.6) onCloseRef.current();
    else setDragY(0);
  }

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="presentation">
      <div
        aria-hidden
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 ${closing ? 'sheet-backdrop-out' : 'sheet-backdrop-in'}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`popover-surface absolute inset-x-0 bottom-0 flex flex-col rounded-t-3xl border-t border-line pb-[env(safe-area-inset-bottom)] ${closing ? 'sheet-out' : 'sheet-in'}`}
        style={{
          maxHeight: 'min(92dvh, calc(100dvh - env(safe-area-inset-top) - 1rem))',
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: drag.current.active ? 'none' : undefined,
        }}
      >
        {/* Zona de prindere (maner + titlu) - swipe in jos de aici inchide foaia. touch-none ca
            browserul sa nu interpreteze gestul ca scroll al paginii. */}
        <div
          className="shrink-0 touch-none select-none px-5 pb-2 pt-2.5"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="mx-auto h-1.5 w-10 rounded-full bg-white/20" />
          {title && <h2 className="mt-3 break-words font-display text-base font-semibold text-ink">{title}</h2>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2">{children}</div>
        {(footer || cancelLabel) && (
          <div className="shrink-0 border-t border-line px-4 pb-3 pt-3">
            {footer}
            {cancelLabel && (
              <button
                type="button"
                onClick={onClose}
                className="press mt-0 h-12 w-full rounded-2xl bg-white/[.06] text-base font-medium text-ink"
              >
                {cancelLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
