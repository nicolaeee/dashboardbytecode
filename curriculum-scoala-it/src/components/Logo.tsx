/**
 * Logo-ul aplicatiei (varianta A aleasa de utilizator): promptul ">_" pe lime - "din simplu
 * jucator, in creator" (sageata de play devine prompt de cod). Acelasi desen ca
 * public/icons/icon.svg si favicon.ico - daca il schimbi, regenereaza si iconitele.
 */
export default function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <rect width="64" height="64" rx="15" fill="#c8f023" />
      <path d="M17 20 L31 32 L17 44" fill="none" stroke="#0b0b0d" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="34" y="40" width="15" height="7" rx="3.5" fill="#0b0b0d" />
    </svg>
  );
}
