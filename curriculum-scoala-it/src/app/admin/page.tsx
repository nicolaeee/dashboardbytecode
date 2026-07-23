import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui';

async function count(table: string) {
  const supabase = await createClient();
  const { count: n } = await supabase.from(table).select('*', { count: 'exact', head: true });
  return n ?? 0;
}

export default async function AdminDashboard() {
  const [platforms, courses, modules, lessons, teachers, grants] = await Promise.all([
    count('platforms'), count('courses'), count('modules'),
    count('lesson_index'), count('profiles'), count('module_permissions'),
  ]);

  const levels = [
    { label: 'Platforme', value: platforms },
    { label: 'Cursuri', value: courses },
    { label: 'Module', value: modules },
    { label: 'Lecții', value: lessons },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <p className="tag">Panou administrator</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Curriculumul școlii</h1>
        <p className="mt-2 max-w-xl text-sm text-ink/60">
          Construiește structura pe patru niveluri și decide ce vede fiecare profesor.
        </p>
      </header>

      {/* Traseul ierarhiei, cu numerele reale din baza de date */}
      <Card className="overflow-hidden">
        <ol className="grid divide-y divide-line sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {levels.map((l, i) => (
            <li key={l.label} className="px-5 py-5">
              <span className="tag">{String(i + 1).padStart(2, '0')} · nivel</span>
              <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{l.value}</p>
              <p className="text-sm text-ink/60">{l.label}</p>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/admin/curriculum">
          <Card className="h-full p-5 transition hover:border-brand-300">
            <h2 className="font-display text-lg font-semibold">Editează curriculumul</h2>
            <p className="mt-1 text-sm text-ink/60">
              Adaugă platforme, cursuri, module și lecții. Reordonează cu săgețile.
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600">
              Deschide <ArrowRight size={15} />
            </span>
          </Card>
        </Link>

        <Link href="/admin/teachers">
          <Card className="h-full p-5 transition hover:border-brand-300">
            <h2 className="font-display text-lg font-semibold">Profesori și acces</h2>
            <p className="mt-1 text-sm text-ink/60">
              {teachers} conturi · {grants} module deblocate. Promovează un profesor la administrator.
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600">
              Deschide <ArrowRight size={15} />
            </span>
          </Card>
        </Link>
      </div>
    </div>
  );
}
