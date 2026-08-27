'use client';
import { useMemo, useState } from 'react';
import { Archive, Check, Copy, Download, Eye, GraduationCap, MessageCircle } from 'lucide-react';
import type { StudentStatus, TrackerGroup } from '@/lib/types';
import { STUDENT_STATUS_LABELS, diplomaRewardLabel } from '@/lib/types';
import { buildDiplomaUrl, getCourse } from '@/lib/diplomas';
import { computeModuleLesson } from '@/lib/lessonNumbering';
import type { UrgentTaskWithDetails } from '@/lib/urgentTasks';
import { Badge, Button, Card, EmptyState } from '@/components/ui';

export type ArchivedStudentRow = {
  id: string;
  name: string;
  short_name: string | null;
  status: StudentStatus;
  progress: number;
  kind: 'member' | 'transferred_out';
  transferredTo?: { teacherName: string; groupName: string; at: string } | null;
};

export type ArchivedGroupWithDetails = TrackerGroup & {
  teacher_name: string;
  students: ArchivedStudentRow[];
};

function progressLabel(progress: number) {
  const { module, lesson } = computeModuleLesson(Math.max(progress, 1));
  return `${progress} ⭐ · M${module}/L${lesson}`;
}

function courseLabel(course: string | null) {
  if (!course) return '—';
  return getCourse(course)?.label ?? course;
}

function formatDateRo(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/** Numarul de telefon curatat pt. link wa.me (doar cifre - fara "+", spatii etc). */
function waDigits(phone: string) {
  return phone.replace(/[^0-9]/g, '');
}

type Tab = 'classes' | 'diplomas';

export default function ArhivaClient({
  groups, sentDiplomas,
}: { groups: ArchivedGroupWithDetails[]; sentDiplomas: UrgentTaskWithDetails[] }) {
  const [tab, setTab] = useState<Tab>('classes');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyMessage(task: UrgentTaskWithDetails) {
    if (!task.parent_message) return;
    try {
      await navigator.clipboard.writeText(task.parent_message);
    } catch {
      return;
    }
    setCopiedId(task.id);
    setTimeout(() => setCopiedId((id) => (id === task.id ? null : id)), 2000);
  }

  const sortedDiplomas = useMemo(
    () => [...sentDiplomas].sort((a, b) => new Date(b.completed_at ?? b.created_at).getTime() - new Date(a.completed_at ?? a.created_at).getTime()),
    [sentDiplomas]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">🗄️ Arhivă</h1>
        <p className="mt-1 text-sm text-lock">
          Clase fără elevi activi și istoricul diplomelor deja trimise. Diplomele trimise mai vechi de 4 luni se șterg
          automat din baza de date.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={tab === 'classes' ? 'primary' : 'outline'} onClick={() => setTab('classes')}>
          <Archive size={16} /> Clase Arhivate {groups.length > 0 && `(${groups.length})`}
        </Button>
        <Button variant={tab === 'diplomas' ? 'primary' : 'outline'} onClick={() => setTab('diplomas')}>
          <GraduationCap size={16} /> Diplome Trimise {sortedDiplomas.length > 0 && `(${sortedDiplomas.length})`}
        </Button>
      </div>

      {tab === 'classes' ? (
        groups.length === 0 ? (
          <EmptyState title="Nicio clasă arhivată momentan." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {groups.map((g) => (
              <Card key={g.id} className="p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg font-semibold">{g.group_name}</h3>
                    <p className="text-sm text-lock">Profesor: <span className="font-medium text-ink">{g.teacher_name}</span></p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    <Badge tone="lock">🗄️ Arhivată</Badge>
                    {g.course && <Badge tone="brand">{getCourse(g.course)?.label ?? g.course}</Badge>}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-sm text-lock">Elevi ({g.students.length})</span>
                  {g.students.length === 0 ? (
                    <p className="text-xs text-lock">Nu s-a găsit niciun elev asociat acestei clase.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {g.students.map((s) => (
                        <div key={`${s.kind}-${s.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-slate-25 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <span className="font-medium">{s.short_name?.trim() || s.name}</span>
                            <span className="ml-2 text-xs text-lock">{progressLabel(s.progress)}</span>
                            {s.kind === 'transferred_out' && s.transferredTo && (
                              <p className="text-xs text-lock">
                                → {s.transferredTo.teacherName} · {s.transferredTo.groupName} · {new Date(s.transferredTo.at).toLocaleDateString('ro-RO')}
                              </p>
                            )}
                          </div>
                          <Badge tone={s.kind === 'transferred_out' ? 'blue' : s.status === 'dropped_out' ? 'neutral' : 'ok'}>
                            {s.kind === 'transferred_out' ? 'Transferat' : STUDENT_STATUS_LABELS[s.status]}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : sortedDiplomas.length === 0 ? (
        <EmptyState title="Nicio diplomă trimisă momentan." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sortedDiplomas.map((task) => {
            const { module } = computeModuleLesson(task.milestone);
            const diploma = buildDiplomaUrl(task, module);
            const rewardLabel = diplomaRewardLabel(task.reward_type);
            const firstPhone = task.parent_phones[0];
            return (
              <Card key={task.id} className="p-5 space-y-4 opacity-90">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Badge tone="ok">🎓 Diplomă trimisă</Badge>
                  {task.completed_at && <span className="text-xs text-lock">Finalizat pe {formatDateRo(task.completed_at)}</span>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-lock">Copil</span><p className="font-semibold">{task.student_short_name?.trim() || task.student_name}</p></div>
                  <div><span className="text-lock">Profesor</span><p className="font-semibold">{task.teacher_name}</p></div>
                  <div><span className="text-lock">Modul</span><p className="font-semibold">Modulul {module} — {courseLabel(task.course)}{task.group_name ? ` (${task.group_name})` : ''}</p></div>
                  <div><span className="text-lock">🎁 Premiu</span><p className="font-semibold">{task.reward_received ? rewardLabel : 'Niciun premiu'}</p></div>
                </div>

                <div>
                  <span className="text-sm text-lock">📜 Diplomă</span>
                  <div className="mt-1.5">
                    {diploma.url ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={diploma.url} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm"><Eye size={14} /> Vezi diploma</Button>
                        </a>
                        <a href={`${diploma.url}&autoDownload=1`} target="_blank" rel="noopener noreferrer">
                          <Button size="sm"><Download size={14} /> Descarcă diploma</Button>
                        </a>
                      </div>
                    ) : (
                      <p className="text-xs text-lock">Cursul „{courseLabel(task.course)}” nu are șablon de diplomă (curs custom).</p>
                    )}
                  </div>
                </div>

                {task.parent_message && (
                  <div>
                    <span className="text-sm text-lock">💬 Mesaj pentru părinte</span>
                    <p className="mt-1 rounded-xl border border-line bg-slate-25 p-3 text-sm leading-relaxed">{task.parent_message}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => copyMessage(task)}>
                        {copiedId === task.id ? <><Check size={14} /> Mesaj copiat!</> : <><Copy size={14} /> Copiază mesajul</>}
                      </Button>
                      {firstPhone && (
                        <a
                          href={`https://wa.me/${waDigits(firstPhone)}?text=${encodeURIComponent(task.parent_message)}`}
                          target="_blank" rel="noopener noreferrer"
                        >
                          <Button variant="outline" size="sm"><MessageCircle size={14} /> Retrimite pe WhatsApp ({firstPhone})</Button>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
