'use client';
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Banner discret "Fără conexiune" cand telefonul pierde internetul - profesorul stie ca o bifa
 * facuta acum poate esua (salvarile raman exact cele de acum: la eroare, valoarea revine si apare
 * toast-ul obisnuit). Nu salveaza nimic offline si nu tine date in cache.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-[#FF6B6B] px-4 pb-1.5 pt-[calc(0.375rem+env(safe-area-inset-top))] text-[13px] font-semibold text-black"
      style={{ animation: 'slide-down var(--dur-base) var(--ease-out)' }}
    >
      <WifiOff size={14} /> Fără conexiune - modificările nu se pot salva acum
    </div>
  );
}
