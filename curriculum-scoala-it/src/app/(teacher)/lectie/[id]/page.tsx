import Link from 'next/link';
import { ArrowLeft, Paperclip, Target, Video } from 'lucide-react';
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
  const exampleEmbed = lesson.example_video_url ? toEmbedUrl(lesson.example_video_url) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/curriculum" className="inline-flex items-center gap-1.5 text-sm text-lock hover:text-ink">
        <ArrowLeft size={15} /> Curriculum
      </Link>

      {/* Antet: titlul lecției */}
      <header className="mt-4">
        <p className="tag" style={{ color: platform.accent }}>{platform.name}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold leading-tight">{lesson.title}</h1>
        <p className="mt-1.5 text-sm text-ink/55">{course.title} · {mod.title}</p>
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
                  sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
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

        {/* Video "rezultat final" - optional, randat cu EXACT acelasi player ca cel de mai
            sus, doar cu propria eticheta ("🎬 Lecție Exemplu") - vezi lesson.example_video_url. */}
        {lesson.example_video_url && (
          <section>
            <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold">
              <Video size={16} className="text-brand-500" /> 🎬 Lecție Exemplu
            </h2>
            <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-black">
              {exampleEmbed ? (
                <div className="aspect-video">
                  <iframe
                    src={exampleEmbed} title={`Lecție Exemplu: ${lesson.title}`} className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="flex aspect-video items-center justify-center text-sm text-white/50">
                  Link video invalid.
                </div>
              )}
            </div>
          </section>
        )}

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
