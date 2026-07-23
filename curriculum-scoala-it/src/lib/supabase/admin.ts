import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Client cu cheia service_role. Ocolește RLS - se folosește DOAR în server
 * actions, pentru operațiuni pe care le poate face exclusiv un administrator
 * (creare conturi de profesor, ștergere conturi).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
