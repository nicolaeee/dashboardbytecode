import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';
import TeachersClient from './TeachersClient';

export default async function TeachersPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from('profiles').select('*').order('role').order('created_at');

  const { data: perms } = await supabase.from('module_permissions').select('teacher_id');
  const counts = (perms ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.teacher_id as string] = (acc[r.teacher_id as string] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header>
        <p className="tag">Echipa</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Profesori</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Creează conturi, deblochează module și promovează un profesor la administrator.
        </p>
      </header>
      <TeachersClient profiles={(profiles ?? []) as Profile[]} moduleCounts={counts} meId={me.id} />
    </div>
  );
}
