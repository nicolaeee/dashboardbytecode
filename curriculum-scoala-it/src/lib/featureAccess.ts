import { createClient } from '@/lib/supabase/server';
import type { FeatureModuleKey, Profile } from '@/lib/types';

/**
 * Modulele noi (Pachete/Abonamente, Rata de Abandon) activate pentru contul curent.
 * Adminul (Super Admin) are acces implicit la toate - vezi feature_access în schema.sql,
 * unde has_feature_access() aplică aceeași regulă la nivel de RLS/RPC. Folosit atât pentru
 * randarea condiționată în meniu ((teacher)/layout.tsx, admin/layout.tsx), cât și ca poartă
 * de acces pe fiecare pagină nouă (redirect dacă modulul nu e activat pentru profesor).
 */
export async function getEnabledFeatureModules(profile: Profile): Promise<Set<FeatureModuleKey>> {
  if (profile.role === 'admin') return new Set<FeatureModuleKey>(['subscriptions', 'dropout_analytics']);
  const supabase = await createClient();
  const { data } = await supabase.from('feature_access').select('module_key').eq('user_id', profile.id).eq('enabled', true);
  return new Set((data ?? []).map((r) => r.module_key as FeatureModuleKey));
}
