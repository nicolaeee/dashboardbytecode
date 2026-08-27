'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Clock, Copy, Download, Eye, MessageCircle, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { diplomaRewardLabel, type UrgentTaskStatus } from '@/lib/types';
import { buildDiplomaUrl, getCourse } from '@/lib/diplomas';
import { computeModuleLesson } from '@/lib/lessonNumbering';
import { Badge, Button, Card, EmptyState, Input, Modal } from '@/components/ui';
import type { UrgentTaskWithDetails } from './page';

const STATUS_LABELS: Record<UrgentTaskStatus, string> = {
  NEW: 'Nou',
  IN_PROGRESS: 'În procesare',
  COMPLETED: 'Finalizat',
};

function formatDateRo(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function courseLabel(course: string | null) {
  if (!course) return '—';
  return getCourse(course)?.label ?? course;
}

/** Numarul de telefon curatat pt. link wa.me (doar cifre - fara "+", spatii etc). */
function waDigits(phone: string) {
  return phone.replace(/[^0-9]/g, '');
}

type TeacherOption = { id: string; label: string };
// Fara COMPLETED - pagina primeste de la server STRICT task-uri NEW/IN_PROGRESS (vezi
// admin/task-uri-urgente/page.tsx); un task finalizat dispare instant din `tasks` (vezi
// updateStatus) si se muta in "Arhivă → Diplome Trimise" (admin/arhiva), nu mai ramane
// niciodata de filtrat aici.
type StatusFilter = 'all' | Exclude<UrgentTaskStatus, 'COMPLETED'>;
type SortBy = 'recent' | 'oldest' | 'teacher' | 'child' | 'module';

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'Toate', NEW: 'Noi', IN_PROGRESS: 'În lucru',
};
const SORT_LABELS: Record<SortBy, string> = {
  recent: 'Cea mai recentă', oldest: 'Cea mai veche', teacher: 'Profesor', child: 'Copil', module: 'Modul',
};

export default function TaskUriUrgenteClient({
  viewerId, initialTasks, teacherOptions,
}: { viewerId: string; initialTasks: UrgentTaskWithDetails[]; teacherOptions: TeacherOption[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState(initialTasks);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // "🗑️ Șterge" - cere confirmare explicită (vezi deleteTask) inainte de a sterge efectiv.
  const [deleteTarget, setDeleteTarget] = useState<UrgentTaskWithDetails | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // "Finalizează" pe task-ul de monede ("🪙 Trimite monedele virtuale") - cere confirmare
  // explicită ("Ai trimis monedele virtuale lui X?") inainte de a marca COMPLETED.
  const [coinsConfirmTarget, setCoinsConfirmTarget] = useState<UrgentTaskWithDetails | null>(null);

  // Filtrare/cautare/sortare - vezi cerinta "Task-uri Urgente - filtrare dupa profesor" -
  // filtrul de profesor foloseste STRICT teacher_id (nu numele afisat), ca sa ramana corect
  // chiar daca doi profesori au acelasi nume afisat.
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [childSearch, setChildSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('recent');

  const visibleTasks = useMemo(() => {
    const query = childSearch.trim().toLocaleLowerCase();
    const filtered = tasks.filter((t) => {
      if (teacherFilter !== 'all' && t.teacher_id !== teacherFilter) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (query) {
        const name = `${t.student_name} ${t.student_short_name ?? ''}`.toLocaleLowerCase();
        if (!name.includes(query)) return false;
      }
      return true;
    });
    const sorted = [...filtered];
    switch (sortBy) {
      case 'recent':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'oldest':
        sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'teacher':
        sorted.sort((a, b) => a.teacher_name.localeCompare(b.teacher_name));
        break;
      case 'child':
        sorted.sort((a, b) => (a.student_short_name || a.student_name).localeCompare(b.student_short_name || b.student_name));
        break;
      case 'module':
        sorted.sort((a, b) => a.milestone - b.milestone);
        break;
    }
    return sorted;
  }, [tasks, teacherFilter, childSearch, statusFilter, sortBy]);

  async function updateStatus(task: UrgentTaskWithDetails, status: UrgentTaskStatus) {
    if (busyIds.has(task.id)) return;
    setBusyIds((s) => new Set(s).add(task.id));
    const patch = status === 'COMPLETED' ? { status, completed_at: new Date().toISOString(), completed_by: viewerId } : { status };
    const { error } = await supabase.from('urgent_tasks').update(patch).eq('id', task.id);
    if (!error) {
      // Optimistic UI: un task finalizat (diploma trimisa / monedele trimise) nu mai are ce
      // cauta in Task-uri Urgente - dispare instant, nu doar isi schimba badge-ul de status.
      // Ramane vizibil ca istoric in "Arhivă → Diplome Trimise" (admin/arhiva), citit direct
      // din DB (status = COMPLETED), fara sa fie nevoie sa-l tinem si aici local.
      if (status === 'COMPLETED') {
        setTasks((ts) => ts.filter((t) => t.id !== task.id));
      } else {
        setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, ...patch } : t)));
      }
    } else {
      console.error('URGENT TASK UPDATE ERROR:', error);
    }
    setBusyIds((s) => { const next = new Set(s); next.delete(task.id); return next; });
  }

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

  // "🗑️ Șterge" - sterge DOAR randul din urgent_tasks (nu atinge tracker_students/tracker_groups/
  // profiles sau vreo diploma stocata separat - nu exista asa ceva, diploma e mereu randata din
  // sablonul HTML + snapshot, nimic de curatat in alta parte). RLS-ul existent pe urgent_tasks
  // ("adminul gestioneaza task-urile urgente", for all) acopera deja DELETE - fara politica noua.
  async function deleteTask() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const { error } = await supabase.from('urgent_tasks').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) {
      console.error('URGENT TASK DELETE ERROR:', error);
      setDeleteError('Ștergerea a eșuat. Încearcă din nou.');
      return;
    }
    setTasks((ts) => ts.filter((t) => t.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleteError(null);
  }

  function renderTask(task: UrgentTaskWithDetails) {
    const busy = busyIds.has(task.id);
    const isOverdue = task.type === 'DIPLOMA_NOT_SENT';
    // "🪙 Trimite monedele virtuale" - task separat, DOAR pentru admin, creat automat de
    // finalize_diploma_with_reward cand recompensa e "Bani virtuali" (vezi Diplome.tsx). Status
    // independent de task-ul diplomei ("🎓 Trimite diploma părintelui") - vezi cerinta.
    const isCoins = task.type === 'SEND_VIRTUAL_COINS';
    const { module } = computeModuleLesson(task.milestone);
    const rewardLabel = diplomaRewardLabel(task.reward_type);
    const firstPhone = task.parent_phones[0];
    const diploma = (isOverdue || isCoins) ? null : buildDiplomaUrl(task, module);

    return (
      <Card key={task.id} className={`p-5 space-y-4 ${isOverdue ? 'border-[#FF6B6B]/40' : ''} ${task.status === 'COMPLETED' ? 'opacity-70' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {isOverdue ? (
              <Badge tone="lock"><span className="text-[#FF6B6B]">🔴 Urgent — Diplomă netrimisă</span></Badge>
            ) : isCoins ? (
              <Badge tone="brand">🪙 Trimite monedele virtuale lui {task.student_short_name?.trim() || task.student_name}</Badge>
            ) : (
              <Badge tone="brand">🎓 Trimite diploma părintelui</Badge>
            )}
            <Badge tone={task.status === 'IN_PROGRESS' ? 'blue' : task.status === 'COMPLETED' ? 'ok' : 'neutral'}>
              {STATUS_LABELS[task.status]}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><span className="text-lock">Copil</span><p className="font-semibold">{task.student_short_name?.trim() || task.student_name}</p></div>
          <div><span className="text-lock">Profesor</span><p className="font-semibold">{task.teacher_name}</p></div>
          <div><span className="text-lock">Modul</span><p className="font-semibold">Modulul {module} — {courseLabel(task.course)}{task.group_name ? ` (${task.group_name})` : ''}</p></div>
          {isOverdue ? (
            <>
              <div><span className="text-lock">Prezențe</span><p className="font-semibold">{task.milestone} / {task.milestone}</p></div>
              <div><span className="text-lock">A ajuns la {task.milestone} prezențe</span><p className="font-semibold">{formatDateRo(task.milestone_reached_at)}</p></div>
              <div><span className="text-lock">Timp trecut</span><p className="font-semibold text-[#FF6B6B]">{daysSince(task.milestone_reached_at)} zile</p></div>
              <div><span className="text-lock">Diplomă</span><p className="font-semibold">Nu a fost trimisă</p></div>
            </>
          ) : isCoins ? (
            <>
              {task.reward_details && (
                <div><span className="text-lock">📝 Detalii</span><p className="font-semibold">{task.reward_details}</p></div>
              )}
            </>
          ) : (
            <div><span className="text-lock">Status</span><p className="font-semibold">Finalizat</p></div>
          )}
        </div>

        {!isOverdue && !isCoins && (
          <>
            <div className="text-sm">
              <span className="text-lock">🎁 Premiu</span>
              {task.reward_received ? (
                <p className="font-semibold">
                  {rewardLabel}
                  {task.reward_details && <span className="block font-normal text-lock">📝 Detalii: {task.reward_details}</span>}
                </p>
              ) : (
                <p className="font-semibold">Niciun premiu</p>
              )}
            </div>

            <div>
              <span className="text-sm text-lock">📜 Diplomă</span>
              <div className="mt-1.5">
                {diploma?.url ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={diploma.url} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm"><Eye size={14} /> Vezi diploma</Button>
                    </a>
                    <a href={`${diploma.url}&autoDownload=1`} target="_blank" rel="noopener noreferrer">
                      <Button size="sm"><Download size={14} /> Descarcă diploma</Button>
                    </a>
                  </div>
                ) : diploma?.reason === 'no-template' ? (
                  <p className="text-xs text-lock">Cursul „{courseLabel(task.course)}” nu are șablon de diplomă (curs custom).</p>
                ) : (
                  <p className="text-xs text-[#FF6B6B]">
                    Diploma nu are un instantaneu salvat (task creat înainte de migrarea SQL
                    „add_diploma_snapshot_to_urgent_tasks.sql”, sau schema cache-ul Supabase nu s-a
                    reîncărcat încă) — rulează migrarea, apoi reîncarcă pagina.
                  </p>
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
                      <Button variant="outline" size="sm"><MessageCircle size={14} /> Trimite pe WhatsApp ({firstPhone})</Button>
                    </a>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-line">
          <div className="flex flex-wrap gap-2">
            {isCoins ? (
              task.status !== 'COMPLETED' && (
                <Button size="sm" disabled={busy} onClick={() => setCoinsConfirmTarget(task)}>
                  <Check size={14} /> Finalizează
                </Button>
              )
            ) : (
              <>
                {task.status !== 'COMPLETED' && task.status === 'NEW' && (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => updateStatus(task, 'IN_PROGRESS')}>
                    <Clock size={14} /> Marchează în procesare
                  </Button>
                )}
                {task.status !== 'COMPLETED' && (
                  <Button size="sm" disabled={busy} onClick={() => updateStatus(task, 'COMPLETED')}>
                    <Check size={14} /> Finalizează task-ul
                  </Button>
                )}
              </>
            )}
          </div>
          <Button variant="danger" size="sm" onClick={() => { setDeleteError(null); setDeleteTarget(task); }}>
            <Trash2 size={14} /> Șterge
          </Button>
        </div>
      </Card>
    );
  }

  const hasActiveFilters = teacherFilter !== 'all' || childSearch.trim() !== '' || statusFilter !== 'all';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <AlertTriangle size={22} className="text-[#FF6B6B]" /> Task-uri Urgente
        </h1>
        <p className="mt-1 text-sm text-lock">
          Diplome de trimis părinților, monede virtuale de trimis și diplome netrimise la 3 zile de la atingerea pragului de prezențe.
          Task-urile finalizate dispar de aici și apar în{' '}
          <Link href="/admin/arhiva" className="text-brand-500 underline underline-offset-2 hover:text-brand-600">Arhivă → Diplome Trimise</Link>.
        </p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-ink">Profesor</span>
            <select
              value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}
              className="glass h-10 w-full rounded-xl border border-line px-3 text-sm text-ink focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 hover:border-brand-300"
            >
              <option value="all" className="bg-night text-ink">Toți profesorii</option>
              {teacherOptions.map((t) => (
                <option key={t.id} value={t.id} className="bg-night text-ink">{t.label}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-ink">Copil</span>
            <Input
              type="text" value={childSearch} onChange={(e) => setChildSearch(e.target.value)}
              placeholder="🔍 Caută copil..."
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-ink">Status</span>
            <select
              value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="glass h-10 w-full rounded-xl border border-line px-3 text-sm text-ink focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 hover:border-brand-300"
            >
              {(Object.keys(STATUS_FILTER_LABELS) as StatusFilter[]).map((s) => (
                <option key={s} value={s} className="bg-night text-ink">{STATUS_FILTER_LABELS[s]}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-ink">Sortare</span>
            <select
              value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="glass h-10 w-full rounded-xl border border-line px-3 text-sm text-ink focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 hover:border-brand-300"
            >
              {(Object.keys(SORT_LABELS) as SortBy[]).map((s) => (
                <option key={s} value={s} className="bg-night text-ink">{SORT_LABELS[s]}</option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {visibleTasks.length === 0 ? (
        <EmptyState title={hasActiveFilters ? 'Niciun task nu corespunde filtrelor alese.' : 'Niciun task urgent momentan. 🎉'} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{visibleTasks.map(renderTask)}</div>
      )}

      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Ștergi acest task?"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Anulează</Button>
            <Button variant="danger" onClick={deleteTask} disabled={deleting}>
              {deleting ? 'Se șterge...' : 'Șterge'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">
          Ștergi definitiv task-ul pentru{' '}
          <span className="font-semibold">{deleteTarget?.student_short_name?.trim() || deleteTarget?.student_name}</span>? Diploma, elevul și profesorul rămân neatinse - se șterge doar acest task din Task-uri Urgente.
        </p>
        {deleteError && <p className="mt-2 text-xs text-[#FF6B6B]">{deleteError}</p>}
      </Modal>

      <Modal
        open={!!coinsConfirmTarget}
        onClose={() => setCoinsConfirmTarget(null)}
        title="Ai trimis monedele virtuale?"
        footer={
          <>
            <Button variant="outline" onClick={() => setCoinsConfirmTarget(null)}>Anulează</Button>
            <Button
              onClick={async () => {
                if (!coinsConfirmTarget) return;
                await updateStatus(coinsConfirmTarget, 'COMPLETED');
                setCoinsConfirmTarget(null);
              }}
            >
              Da, am trimis
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">
          Ai trimis monedele virtuale lui{' '}
          <span className="font-semibold">{coinsConfirmTarget?.student_short_name?.trim() || coinsConfirmTarget?.student_name}</span>?
        </p>
      </Modal>
    </div>
  );
}
