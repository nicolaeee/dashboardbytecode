'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { KeyRound, Lock, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { Badge, Button, Card, Field, Input, Modal } from '@/components/ui';
import { createTeacher, deleteTeacher, resetTeacherPassword, setUserActive, setUserLevel, setUserRole, updateTeacherProfile } from '@/app/admin/actions';
import type { Profile, Role, TeacherLevel } from '@/lib/types';

export default function TeachersClient({
  profiles, meId,
}: { profiles: Profile[]; meId: string }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'teacher' as Role, level: 'Junior' as TeacherLevel, phone: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetPending, startResetTransition] = useTransition();

  // Modal deschis la click pe avatarul profesorului - editare completa (nume/email/rol/nivel/telefon).
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', email: '', role: 'teacher' as Role, level: 'Junior' as TeacherLevel, phone: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, startEditTransition] = useTransition();

  function openEdit(p: Profile) {
    setEditTarget(p);
    setEditForm({ full_name: p.full_name, email: p.email, role: p.role, level: p.level, phone: p.phone ?? '' });
    setEditError(null);
  }

  function submitEdit() {
    if (!editTarget) return;
    startEditTransition(async () => {
      const res = await updateTeacherProfile(editTarget.id, editForm);
      if (res.ok) setEditTarget(null); else setEditError(res.error ?? 'A apărut o eroare.');
    });
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.ok ? null : res.error ?? 'A apărut o eroare.');
      if (res.ok) setAdding(false);
    });

  const submitCreate = () => {
    const full_name = form.full_name.trim();
    const email = form.email.trim();
    if (!full_name) { setError('Introdu numele complet.'); return; }
    if (!email) { setError('Introdu adresa de email.'); return; }
    if (form.password.length < 8) { setError('Parola trebuie să aibă minim 8 caractere.'); return; }
    run(() => createTeacher({ ...form, full_name, email }));
  };

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
        <Button onClick={() => { setForm({ full_name: '', email: '', password: '', role: 'teacher', level: 'Junior', phone: '' }); setAdding(true); }}>
          <Plus size={16} /> Adaugă profesor
        </Button>
      </div>

      <Card className="divide-y divide-line">
        {profiles.map((p) => (
          <div key={p.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
            <button
              type="button" onClick={() => openEdit(p)} title="Editează profesorul"
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-opacity hover:opacity-80
                ${p.role === 'admin' ? 'bg-brand-50 text-brand-500' : 'bg-slate-150 text-lock'}`}>
              {p.role === 'admin' ? <ShieldCheck size={17} /> : <UserRound size={17} />}
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">
                {p.full_name || '(fără nume)'}
                {p.id === meId && <span className="ml-1.5 text-[12px] font-normal text-lock">— tu</span>}
              </p>
              <p className="truncate text-[13px] text-lock">{p.email}</p>
            </div>

            {/* Nivelul e afisat DOAR in selectorul fuzionat Rol/Nivel de mai jos (nu si aici,
                ca sa nu duplicam aceeasi informatie in doua locuri) - vezi RoleLevelSelect. */}
            <div className="flex flex-wrap items-center gap-2">
              {p.role === 'admin' && <Badge tone="brand">Administrator · acces total</Badge>}
              {!p.is_active && <Badge tone="lock">Dezactivat</Badge>}
            </div>

            <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
              {p.role === 'teacher' && (
                <Link href={`/admin/teachers/${p.id}`}>
                  <Button size="sm" variant="outline"><KeyRound size={14} /> Acces</Button>
                </Link>
              )}
              <RoleLevelSelect
                compact
                role={p.role} level={p.level}
                disabled={pending || p.id === meId}
                onRoleChange={(role) => run(() => setUserRole(p.id, role))}
                onLevelChange={(level) => run(() => setUserLevel(p.id, level))}
              />
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
            <Button disabled={pending} onClick={submitCreate}>
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
        <Field label="Număr de telefon" hint="Opțional - folosit și în webhook-urile de diplomă.">
          <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+40712345678" />
        </Field>
        <Field label="Parolă inițială" hint="Transmite-o profesorului; o poate schimba ulterior.">
          <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="minim 8 caractere" />
        </Field>
        <Field label="Rol">
          <RoleLevelSelect
            role={form.role} level={form.level}
            onRoleChange={(role) => setForm({ ...form, role })}
            onLevelChange={(level) => setForm({ ...form, level })}
          />
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

      <Modal
        open={!!editTarget}
        onClose={() => { setEditTarget(null); setEditError(null); }}
        title="Editează profesor"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Renunță</Button>
            <Button disabled={editPending} onClick={submitEdit}>
              {editPending ? 'Se salvează…' : 'Salvează modificările'}
            </Button>
          </>
        }
      >
        <Field label="Nume complet">
          <Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} autoFocus />
        </Field>
        <Field label="Email">
          <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
        </Field>
        <Field label="Număr de telefon" hint="Opțional - folosit și în webhook-urile de diplomă.">
          <Input type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="+40712345678" />
        </Field>
        <Field label="Rol">
          <RoleLevelSelect
            role={editForm.role} level={editForm.level}
            disabled={editTarget?.id === meId}
            onRoleChange={(role) => setEditForm({ ...editForm, role })}
            onLevelChange={(level) => setEditForm({ ...editForm, level })}
          />
        </Field>
        <Button
          type="button" variant="outline" size="sm"
          onClick={() => {
            if (editTarget) { setResetTarget(editTarget); setNewPassword(''); setResetError(null); }
            setEditTarget(null);
          }}
        >
          <Lock size={14} /> Resetează parola
        </Button>
        {editError && (
          <p className="rounded-xl border border-[#FF6B6B]/30 bg-[#FF6B6B]/10 px-3 py-2 text-[13px] text-[#FF6B6B]">{editError}</p>
        )}
      </Modal>
    </div>
  );
}

/**
 * Selector fuzionat Rol + Nivel - un singur control vizual (un chenar comun), nu doua
 * dropdown-uri separate. Nivelul (Junior/Middle/Senior) apare instant in dreapta rolului
 * DOAR cand rolul e "Profesor" - un admin nu are nivel, deci sub-selectorul dispare complet
 * la schimbarea rolului pe "Administrator". Reutilizat identic in randul din lista, in
 * modalul de creare si in modalul de editare, ca cele 3 locuri sa nu diveraga in timp.
 */
function RoleLevelSelect({
  role, level, onRoleChange, onLevelChange, disabled, compact,
}: {
  role: Role; level: TeacherLevel;
  onRoleChange: (role: Role) => void; onLevelChange: (level: TeacherLevel) => void;
  disabled?: boolean; compact?: boolean;
}) {
  const sizeClasses = compact ? 'h-8 text-[13px]' : 'h-10 text-sm';
  return (
    <div className={`glass flex items-stretch rounded-xl border border-line ${disabled ? 'opacity-50' : ''} ${compact ? '' : 'w-full'}`}>
      <select
        value={role}
        disabled={disabled}
        onChange={(e) => onRoleChange(e.target.value as Role)}
        className={`bg-transparent ${sizeClasses} rounded-l-xl px-3 text-ink focus:outline-none disabled:cursor-not-allowed ${role === 'admin' ? 'rounded-r-xl' : ''}`}
        aria-label="Rol"
      >
        <option value="teacher" className="bg-night text-ink">Profesor</option>
        <option value="admin" className="bg-night text-ink">Administrator</option>
      </select>
      {role === 'teacher' && (
        <>
          <span className="w-px shrink-0 bg-line" aria-hidden />
          <select
            value={level}
            disabled={disabled}
            onChange={(e) => onLevelChange(e.target.value as TeacherLevel)}
            className={`bg-transparent ${sizeClasses} flex-1 rounded-r-xl px-3 text-ink focus:outline-none disabled:cursor-not-allowed`}
            aria-label="Nivel"
          >
            <option value="Junior" className="bg-night text-ink">Junior</option>
            <option value="Middle" className="bg-night text-ink">Middle</option>
            <option value="Senior" className="bg-night text-ink">Senior</option>
          </select>
        </>
      )}
    </div>
  );
}
