import Link from 'next/link';
import { ArrowLeft, ExternalLink, Paperclip, Target, Video } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { canAccessLesson, getLessonContext, toEmbedUrl } from '@/lib/queries';
import { Card } from '@/components/ui';
import AccessDenied from '@/components/AccessDenied';

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  // Verificare la nivel de rută: nu ne bazăm pe ce e ascuns vizual.
  const allowed = await canAccessLesson(id);
  if (!allowed) return <div className="py-10"><AccessDenied /></div>;

  const ctx = await getLessonContext(id);
  if (!ctx) return <div className="py-10"><AccessDenied /></div>;

  const { lesson, module: mod, course, platform } = ctx;
  const embed = toEmbedUrl(lesson.video_url);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/curriculum" className="inline-flex items-center gap-1.5 text-sm text-lock hover:text-ink">
        <ArrowLeft size={15} /> Curriculum
      </Link>

      {/* Antet: titlul lecției + linkurile rapide, sus-dreapta */}
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="tag" style={{ color: platform.accent }}>{platform.name}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold leading-tight">{lesson.title}</h1>
          <p className="mt-1.5 text-sm text-ink/55">{course.title} · {mod.title}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <QuickLink href={lesson.teacher_project_url} label="Proiect profesor" primary />
          <QuickLink href={lesson.student_project_url} label="Proiect copil" />
        </div>
      </header>

      <div className="mt-7 space-y-6">
        {/* Obiectivul lecției */}
        <Card className="border-l-4 p-5" style={{ borderLeftColor: platform.accent }}>
          <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold">
            <Target size={16} className="text-brand-500" /> Obiectivul lecției
          </h2>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink/80">
            {lesson.objective || 'Obiectivul nu a fost completat încă de administrator.'}
          </p>
        </Card>

        {/* Video explicativ */}
        <section>
          <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold">
            <Video size={16} className="text-brand-500" /> Video explicativ
          </h2>
          <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-black">
            {embed ? (
              <div className="aspect-video">
                <iframe
                  src={embed} title={`Video: ${lesson.title}`} className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center text-sm text-white/50">
                Nu există încă un video pentru această lecție.
              </div>
            )}
          </div>
        </section>

        {/* Observații + temă */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-display text-[15px] font-semibold">Observații importante</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink/75">
              {lesson.notes || 'Fără observații pentru această lecție.'}
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-[15px] font-semibold">Temă pentru acasă</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink/75">
              {lesson.homework || 'Fără temă pentru această lecție.'}
            </p>
            {lesson.homework_url && (
              <a href={lesson.homework_url} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
                <Paperclip size={14} /> Deschide materialul temei
              </a>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  if (!href) {
    return (
      <span className="inline-flex h-14 cursor-not-allowed items-center gap-2 rounded-2xl border border-dashed border-line px-6 text-base text-lock">
        {label} · lipsă
      </span>
    );
  }
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer"
      className={`inline-flex h-14 items-center gap-2.5 rounded-2xl px-6 text-base font-semibold transition
        ${primary
          ? 'bg-brand-500 text-black shadow-glow hover:bg-brand-600'
          : 'glass border-2 border-brand-500/60 text-brand-500 hover:bg-brand-500/10 hover:border-brand-500 hover:shadow-glow-sm'}`}
    >
      {label} <ExternalLink size={16} />
    </a>
  );
}
