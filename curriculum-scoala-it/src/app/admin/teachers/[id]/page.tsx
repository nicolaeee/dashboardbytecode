import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getAccessMap, getTree } from '@/lib/queries';
import type { Profile } from '@/lib/types';
import PermissionsClient from './PermissionsClient';

export default async function TeacherAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const { data: teacher } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (!teacher) notFound();

  const tree = await getTree(await getAccessMap(me));
  const [{ data: mp }, { data: lp }] = await Promise.all([
    supabase.from('module_permissions').select('module_id').eq('teacher_id', id),
    supabase.from('lesson_permissions').select('lesson_id').eq('teacher_id', id),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <Link href="/admin/teachers" className="inline-flex items-center gap-1.5 text-sm text-lock hover:text-ink">
        <ArrowLeft size={15} /> Profesori
      </Link>

      <header>
        <p className="tag">Acces la curriculum</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">{(teacher as Profile).full_name || (teacher as Profile).email}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Deblochează un modul întreg sau doar anumite lecții. Restul rămâne vizibil, dar blocat.
        </p>
      </header>

      <PermissionsClient
        teacherId={id}
        tree={tree}
        initialModules={(mp ?? []).map((r) => r.module_id as string)}
        initialLessons={(lp ?? []).map((r) => r.lesson_id as string)}
      />
    </div>
  );
}
