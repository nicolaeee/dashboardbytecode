'use client';
import { useState, useTransition } from 'react';
import { Card, Switch } from '@/components/ui';
import { setFeatureAccess } from '@/app/admin/actions';
import type { FeatureModuleKey } from '@/lib/types';
import { FEATURE_MODULE_LABELS } from '@/lib/types';

const MODULE_KEYS: FeatureModuleKey[] = ['subscriptions', 'dropout_analytics'];

/**
 * Comutator Super Admin pentru modulele noi (Pachete/Abonamente, Rata de Abandon) - randarea
 * lor în meniul profesorului ((teacher)/layout.tsx) și accesul pe pagină depind STRICT de
 * acest comutator (vezi src/lib/featureAccess.ts). Același tipar vizual ca PermissionsClient
 * de mai jos, dar la nivel de secțiune întreagă a aplicației, nu de conținut curriculum.
 */
export default function FeatureAccessClient({
  userId, initialEnabled,
}: { userId: string; initialEnabled: FeatureModuleKey[] }) {
  const [enabled, setEnabled] = useState(new Set(initialEnabled));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (moduleKey: FeatureModuleKey, next: boolean) => {
    const previous = enabled;
    setEnabled((prev) => {
      const nextSet = new Set(prev);
      next ? nextSet.add(moduleKey) : nextSet.delete(moduleKey);
      return nextSet;
    });
    startTransition(async () => {
      const res = await setFeatureAccess(userId, moduleKey, next);
      if (!res.ok) { setError(res.error); setEnabled(previous); } else setError(null);
    });
  };

  return (
    <Card className="p-4">
      <h2 className="font-display text-lg font-semibold">Module noi</h2>
      <p className="mt-1 text-sm text-ink/60">
        Activează secțiunile noi pentru acest profesor. Rămân ascunse din meniu până le activezi aici.
      </p>
      {error && (
        <p className="mt-3 rounded-xl border border-[#FF6B6B]/30 bg-[#FF6B6B]/10 px-3 py-2 text-[13px] text-[#FF6B6B]">{error}</p>
      )}
      <div className="mt-3 space-y-2">
        {MODULE_KEYS.map((key) => (
          <div key={key} className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
            <span className="text-[14px] text-ink">{FEATURE_MODULE_LABELS[key]}</span>
            <Switch
              checked={enabled.has(key)} disabled={pending}
              label={`Acces la ${FEATURE_MODULE_LABELS[key]}`}
              onChange={(v) => toggle(key, v)}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
