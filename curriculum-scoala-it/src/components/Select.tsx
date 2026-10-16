'use client';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import BottomSheet from './BottomSheet';

// Sub acest prag (telefon/tableta) lista se deschide ca foaie de jos; peste el - dropdown-ul de acum.
const SHEET_QUERY = '(max-width: 1023px)';
// De la cate optiuni apare cautarea in foaie (ex. lista de profesori/copii).
const SHEET_SEARCH_MIN = 10;

export type SelectOption<T extends string = string> = { value: T; label: string; disabled?: boolean };

const SIZES = {
  sm: 'h-8 px-2.5 text-[13px]',
  md: 'h-10 px-3 text-sm',
  lg: 'h-12 px-4 text-sm',
};

/**
 * Dropdown-ul unic al aplicatiei - inlocuieste <select>-ul nativ, ale carui optiuni (lista
 * deschisa + hover) sunt desenate de sistemul de operare si nu pot fi stilizate pe tema noastra
 * (sticla neagra cu blur, optiunea activa/hover pe lime cu text negru - ca butoanele din meniul
 * lateral, ex. "Progress Tracker"). Lista e randata intr-un
 * portal cu pozitie `fixed`, ca sa nu fie taiata de containerele cu overflow (modale, carduri).
 *
 * Tastatura, ca la un <select> nativ: ↑/↓/Home/End muta optiunea activa, Enter/Space alege,
 * Escape/Tab inchide, o litera sare la prima optiune care incepe cu ea.
 *
 * `bare` - fara fundal/bordura proprii, pentru cand dropdown-ul sta intr-un container comun deja
 * stilizat (ex. RoleLevelSelect din admin/teachers).
 */
export function Select<T extends string>({
  value, onChange, options, placeholder = 'Alege...', disabled, size = 'md', bare, className = '',
  'aria-label': ariaLabel, id,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  size?: keyof typeof SIZES;
  bare?: boolean;
  className?: string;
  'aria-label'?: string;
  id?: string;
}) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxWidth: number; maxHeight: number; flip: boolean } | null>(null);

  const selected = options.find((o) => o.value === value);

  const reposition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
    const spaceAbove = rect.top - gap - 8;
    const flip = spaceBelow < 180 && spaceAbove > spaceBelow;
    setPosition({
      top: flip ? rect.top - gap : rect.bottom + gap,
      left: rect.left,
      width: rect.width,
      // Lista nu iese niciodata din ecran spre dreapta - un nume prea lung se trunchiaza cu "...".
      maxWidth: Math.max(rect.width, window.innerWidth - rect.left - 8),
      maxHeight: Math.min(256, flip ? spaceAbove : spaceBelow),
      flip,
    });
  }, []);

  function openList() {
    if (disabled) return;
    // Pe telefon: foaie de jos (optiuni mari, bifa la cea curenta, cautare de la 10 optiuni).
    if (typeof window !== 'undefined' && window.matchMedia(SHEET_QUERY).matches) {
      setQuery('');
      setSheetOpen(true);
      return;
    }
    reposition();
    const current = options.findIndex((o) => o.value === value);
    setActiveIndex(current >= 0 ? current : options.findIndex((o) => !o.disabled));
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    close();
    triggerRef.current?.focus();
  }

  function moveActive(from: number, step: 1 | -1) {
    for (let i = from + step; i >= 0 && i < options.length; i += step) {
      if (!options[i].disabled) return i;
    }
    return from;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActiveIndex((i) => moveActive(i, 1)); break;
      case 'ArrowUp': e.preventDefault(); setActiveIndex((i) => moveActive(i, -1)); break;
      case 'Home': e.preventDefault(); setActiveIndex(moveActive(-1, 1)); break;
      case 'End': e.preventDefault(); setActiveIndex(moveActive(options.length, -1)); break;
      case 'Enter': case ' ': e.preventDefault(); choose(activeIndex); break;
      case 'Escape': e.preventDefault(); close(); break;
      case 'Tab': close(); break;
      default:
        if (e.key.length === 1) {
          const letter = e.key.toLocaleLowerCase();
          const match = options.findIndex((o, i) => i > activeIndex && !o.disabled && o.label.toLocaleLowerCase().startsWith(letter));
          const wrap = options.findIndex((o) => !o.disabled && o.label.toLocaleLowerCase().startsWith(letter));
          const next = match >= 0 ? match : wrap;
          if (next >= 0) setActiveIndex(next);
        }
    }
  }

  // Click in afara (trigger + lista) inchide; scroll/resize repozitioneaza lista langa trigger.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close();
    }
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);

  // Optiunea activa ramane mereu vizibila in lista (navigare cu tastatura pe liste lungi).
  useLayoutEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const surface = bare
    ? 'bg-transparent border-0'
    : `bg-black/60 lg:backdrop-blur-md border ${open ? 'border-[#c8f023] ring-2 ring-[#c8f023]/25' : 'border-gray-800 hover:border-gray-600'} rounded-xl`;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open || sheetOpen}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open || sheetOpen ? (close(), setSheetOpen(false)) : openList())}
        onKeyDown={onKeyDown}
        className={`flex min-w-0 items-center justify-between gap-2 text-left text-white transition
          focus:outline-none focus-visible:outline-none ${bare ? '' : 'focus-visible:border-[#c8f023] focus-visible:ring-2 focus-visible:ring-[#c8f023]/25'}
          disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-11 ${SIZES[size]} ${surface} ${className}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? '' : 'text-slate-400'}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180 text-[#c8f023]' : ''}`} />
      </button>

      {open && position && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: 'fixed',
            left: position.left,
            minWidth: position.width,
            maxWidth: position.maxWidth,
            maxHeight: position.maxHeight,
            ...(position.flip ? { bottom: window.innerHeight - position.top } : { top: position.top }),
          }}
          className={`z-[80] max-h-64 max-w-[calc(100vw-16px)] space-y-0.5 overflow-y-auto overflow-x-hidden rounded-xl border border-gray-800 bg-black/80 p-1.5
            text-sm text-gray-200 shadow-pop backdrop-blur-md no-scrollbar`}
        >
          {options.length === 0 && <li className="px-4 py-2 text-gray-500">Nicio opțiune</li>}
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(index)}
                title={option.label}
                className={`flex min-w-0 cursor-pointer items-center justify-between gap-3 overflow-hidden rounded-lg px-4 py-2 transition-colors
                  ${option.disabled ? 'cursor-not-allowed opacity-40' : ''}
                  ${isActive ? 'bg-[#c8f023] font-medium text-black' : isSelected ? 'font-medium text-[#c8f023]' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {isSelected && <Check size={14} className={`shrink-0 ${isActive ? 'text-black' : 'text-[#c8f023]'}`} />}
              </li>
            );
          })}
        </ul>,
        document.body,
      )}

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={ariaLabel ?? placeholder}>
        {options.length >= SHEET_SEARCH_MIN && (
          <div className="sticky top-0 z-10 bg-[var(--surface-pop)] px-1 pb-2">
            <label className="flex h-12 items-center gap-2 rounded-xl border border-line bg-white/[.04] px-3">
              <Search size={16} className="shrink-0 text-slate-400" />
              <input
                type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Caută..." aria-label="Caută în listă"
                className="min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-slate-500 focus:outline-none"
              />
            </label>
          </div>
        )}
        <ul role="listbox" aria-label={ariaLabel} className="space-y-0.5">
          {(() => {
            const q = query.trim().toLocaleLowerCase();
            const visible = options.map((o, i) => ({ o, i })).filter(({ o }) => !q || o.label.toLocaleLowerCase().includes(q));
            if (visible.length === 0) return <li className="px-4 py-3 text-base text-gray-500">Nicio opțiune</li>;
            return visible.map(({ o, i }) => {
              const isSelected = o.value === value;
              return (
                <li key={o.value} role="option" aria-selected={isSelected} aria-disabled={o.disabled || undefined}>
                  <button
                    type="button" disabled={o.disabled}
                    onClick={() => { setSheetOpen(false); choose(i); }}
                    className={`press flex min-h-12 w-full min-w-0 items-center gap-3 rounded-xl px-4 text-left text-base disabled:opacity-40 ${isSelected ? 'bg-[#c8f023]/10 font-medium text-[#c8f023]' : 'text-gray-100'}`}
                  >
                    <span className="min-w-0 flex-1 break-words py-2">{o.label}</span>
                    {isSelected && <Check size={18} className="shrink-0" />}
                  </button>
                </li>
              );
            });
          })()}
        </ul>
      </BottomSheet>
    </>
  );
}
