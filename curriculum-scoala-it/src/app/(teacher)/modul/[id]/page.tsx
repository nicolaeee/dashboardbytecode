import Link from 'next/link';
import { ArrowLeft, Lock, PlayCircle } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { canAccessModule, getAccessMap, lessonUnlocked } from '@/lib/queries';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui';
import AccessDenied from '@/components/AccessDenied';
import type { LessonStub, Module } from '@/lib/types';

export default async function ModulePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireUser();
  const { id } = await params;

  // Blocare la nivel de rută, chiar dacă linkul e introdus manual în bară.
  if (!(await canAccessModule(id))) return <div className="py-10"><AccessDenied /></div>;

  const supabase = await createClient();
  const { data: mod } = await supabase.from('modules').select('*').eq('id', id).maybeSingle();
  if (!mod) return <div className="py-10"><AccessDenied /></div>;

  const { data: lessons } = await supabase
    .from('lesson_index').select('*').eq('module_id', id).order('position');
  const access = await getAccessMap(profile);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/curriculum" className="inline-flex items-center gap-1.5 text-sm text-lock hover:text-ink">
        <ArrowLeft size={15} /> Curriculum
      </Link>
      <header>
        <p className="tag">Modul</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">{(mod as Module).title}</h1>
        {(mod as Module).description && <p className="mt-2 text-sm text-ink/60">{(mod as Module).description}</p>}
      </header>

      <Card className="divide-y divide-line">
        {((lessons ?? []) as LessonStub[]).map((lesson, i) => {
          const canOpen = lessonUnlocked(access, lesson);
          const body = (
            <>
              <span className="tag w-7 shrink-0">L{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[15px]">{lesson.title}</span>
            </>
          );
          return canOpen ? (
            <Link key={lesson.id} href={`/lectie/${lesson.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-50">
              <PlayCircle size={16} className="shrink-0 text-brand-500" />{body}
            </Link>
          ) : (
            <div key={lesson.id} className="flex items-center gap-3 px-4 py-3 text-lock">
              <Lock size={15} className="shrink-0" />{body}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
