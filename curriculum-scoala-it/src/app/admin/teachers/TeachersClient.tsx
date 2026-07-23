'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { KeyRound, Lock, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { Badge, Button, Card, Field, Input, Modal } from '@/components/ui';
import { createTeacher, deleteTeacher, resetTeacherPassword, setUserActive, setUserRole } from '@/app/admin/actions';
import type { Profile, Role } from '@/lib/types';

export default function TeachersClient({
  profiles, moduleCounts, meId,
}: { profiles: Profile[]; moduleCounts: Record<string, number>; meId: string }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'teacher' as Role });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetPending, startResetTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.ok ? null : res.error ?? 'A apărut o eroare.');
      if (res.ok) setAdding(false);
    });

  const submitReset = () => {
    if (!resetTarget) return;
    if (newPassword.length < 8) { setResetError('Parola trebuie să aibă minim 8 caractere.'); return; }
    startResetTransition(async () => {
      const res = await resetTeacherPassword(resetTarget.id, newPassword);
      if (res.ok) { setResetTarget(null); setNewPassword(''); setResetError(null); } else setResetError(res.error ?? 'A apărut o eroare.');
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-[#FF6B6B]/30 bg-[#FF6B6B]/10 px-4 py-2.5 text-sm text-[#FF6B6B]">{error}</p>
      )}

      <div className="flex justify-end">
        <Button onClick={() => { setForm({ full_name: '', email: '', password: '', role: 'teacher' }); setAdding(true); }}>
          <Plus size={16} /> Adaugă profesor
        </Button>
      </div>

      <Card className="divide-y divide-line">
        {profiles.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full
              ${p.role === 'admin' ? 'bg-brand-50 text-brand-500' : 'bg-slate-150 text-lock'}`}>
              {p.role === 'admin' ? <ShieldCheck size={17} /> : <UserRound size={17} />}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {p.full_name || '(fără nume)'}{' '}
                {p.id === meId && <span className="text-[12px] font-normal text-lock">— tu</span>}
              </p>
              <p className="truncate text-[13px] text-lock">{p.email}</p>
            </div>

            <div className="flex items-center gap-2">
              {p.role === 'admin'
                ? <Badge tone="brand">Administrator · acces total</Badge>
                : <Badge tone={moduleCounts[p.id] ? 'ok' : 'lock'}>
                    {moduleCounts[p.id] ?? 0} module deblocate
                  </Badge>}
              {!p.is_active && <Badge tone="lock">Dezactivat</Badge>}
            </div>

            <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
              {p.role === 'teacher' && (
                <Link href={`/admin/teachers/${p.id}`}>
                  <Button size="sm" variant="outline"><KeyRound size={14} /> Acces</Button>
                </Link>
              )}
              <select
                value={p.role}
                disabled={pending || p.id === meId}
                onChange={(e) => run(() => setUserRole(p.id, e.target.value as Role))}
                className="glass h-8 rounded-xl border border-line px-2 text-[13px] text-ink disabled:opacity-50"
                aria-label="Rol"
              >
                <option value="teacher">Profesor</option>
                <option value="admin">Administrator</option>
              </select>
              <Button size="sm" variant="outline"
                onClick={() => { setResetTarget(p); setNewPassword(''); setResetError(null); }}>
                <Lock size={14} /> Resetează parola
              </Button>
              <Button size="sm" variant="ghost" disabled={pending || p.id === meId}
                onClick={() => run(() => setUserActive(p.id, !p.is_active))}>
                {p.is_active ? 'Dezactivează' : 'Reactivează'}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending || p.id === meId}
                onClick={() => {
                  if (confirm(`Ștergi contul ${p.email}? Acțiunea nu poate fi anulată.`)) run(() => deleteTeacher(p.id));
                }}>
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        ))}
      </Card>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Adaugă profesor"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdding(false)}>Renunță</Button>
            <Button disabled={pending} onClick={() => run(() => createTeacher(form))}>
              {pending ? 'Se creează…' : 'Creează contul'}
            </Button>
          </>
        }
      >
        <Field label="Nume complet">
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="ex: Ioana Popescu" autoFocus />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ioana@scoala.ro" />
        </Field>
        <Field label="Parolă inițială" hint="Transmite-o profesorului; o poate schimba ulterior.">
          <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="minim 8 caractere" />
        </Field>
        <Field label="Rol">
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            className="glass h-10 w-full rounded-xl border border-line px-3 text-sm text-ink"
          >
            <option value="teacher">Profesor — vede doar ce deblochezi</option>
            <option value="admin">Administrator — acces total</option>
          </select>
        </Field>
        <p className="text-xs text-lock">
          Contul nou nu are niciun modul deblocat. Deschide „Acces” după creare.
        </p>
      </Modal>

      <Modal
        open={!!resetTarget}
        onClose={() => { setResetTarget(null); setResetError(null); }}
        title="Resetează parola"
        footer={
          <>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Renunță</Button>
            <Button disabled={resetPending} onClick={submitReset}>
              {resetPending ? 'Se salvează…' : 'Salvează parola nouă'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink/70">
          Setezi o parolă nouă pentru <span className="font-medium text-ink">{resetTarget?.full_name || resetTarget?.email}</span>.
          Parola veche nu mai e necesară — transmite-i noua parolă direct.
        </p>
        <Field label="Parolă nouă">
          <Input
            type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            placeholder="minim 8 caractere" autoFocus
          />
        </Field>
        {resetError && (
          <p className="rounded-xl border border-[#FF6B6B]/30 bg-[#FF6B6B]/10 px-3 py-2 text-[13px] text-[#FF6B6B]">{resetError}</p>
        )}
      </Modal>
    </div>
  );
}
