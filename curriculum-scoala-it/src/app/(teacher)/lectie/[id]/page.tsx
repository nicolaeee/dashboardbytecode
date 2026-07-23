import Link from 'next/link';
import { ArrowLeft, ExternalLink, Lock, Paperclip, PlayCircle, Target, Video } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { canAccessLesson, getAccessMap, getLessonContext, lessonUnlocked, toEmbedUrl } from '@/lib/queries';
import { Card } from '@/components/ui';
import AccessDenied from '@/components/AccessDenied';

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireUser();
  const { id } = await params;

  // Verificare la nivel de rută: nu ne bazăm pe ce e ascuns vizual.
  const allowed = await canAccessLesson(id);
  if (!allowed) return <div className="py-10"><AccessDenied /></div>;

  const ctx = await getLessonContext(id);
  if (!ctx) return <div className="py-10"><AccessDenied /></div>;

  const { lesson, module: mod, course, platform, siblings } = ctx;
  const access = await getAccessMap(profile);
  const embed = toEmbedUrl(lesson.video_url);

  return (
    <div className="mx-auto max-w-6xl">
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

        <div className="flex flex-wrap gap-2">
          <QuickLink href={lesson.teacher_project_url} label="Proiect profesor" primary />
          <QuickLink href={lesson.student_project_url} label="Proiect copil" />
        </div>
      </header>

      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="space-y-6">
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
            <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-ink">
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

        {/* Poziția în curriculum */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <Card className="p-5">
            <h2 className="font-display text-[15px] font-semibold">Poziție în curriculum</h2>

            <ol className="mt-4 space-y-0">
              {[
                { level: 'Platformă', value: platform.name },
                { level: 'Curs', value: course.title },
                { level: 'Modul', value: mod.title },
                { level: 'Lecție', value: lesson.title },
              ].map((row, i, arr) => (
                <li key={row.level} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < arr.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-line" aria-hidden />}
                  <span className="mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 border-white"
                    style={{ background: i === arr.length - 1 ? platform.accent : '#E1E7F0', boxShadow: '0 0 0 1px #E1E7F0' }} />
                  <div className="min-w-0">
                    <p className="tag">{row.level}</p>
                    <p className="text-[13.5px] leading-snug">{row.value}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-5 border-t border-line pt-4">
              <p className="tag">Lecții în modul</p>
              <ul className="mt-2 space-y-0.5">
                {siblings.map((s, i) => {
                  const current = s.id === lesson.id;
                  const canOpen = lessonUnlocked(access, s);
                  const inner = (
                    <>
                      <span className="tag w-6 shrink-0">L{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    </>
                  );
                  if (current) {
                    return (
                      <li key={s.id} className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-2 py-1.5 text-[13px] font-medium text-brand-700">
                        <PlayCircle size={13} className="shrink-0" />{inner}
                      </li>
                    );
                  }
                  return (
                    <li key={s.id}>
                      {canOpen ? (
                        <Link href={`/lectie/${s.id}`} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-slate-25">
                          <PlayCircle size={13} className="shrink-0 text-lock" />{inner}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2 py-1.5 text-[13px] text-lock" title="Conținut blocat">
                          <Lock size={12} className="shrink-0" />{inner}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function QuickLink({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  if (!href) {
    return (
      <span className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-xl border border-dashed border-line px-4 text-sm text-lock">
        {label} · lipsă
      </span>
    );
  }
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer"
      className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium transition
        ${primary ? 'bg-brand-500 text-white hover:bg-brand-600' : 'border border-line bg-white text-ink hover:border-brand-300 hover:text-brand-600'}`}
    >
      {label} <ExternalLink size={14} />
    </a>
  );
}
